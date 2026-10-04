/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { FakeLlm, FakeStt, FakeTts } from "../providers/fakes.js";
import { DISCLOSURE, DISCLOSURE_RECORDED, openingUtterances } from "./prompt.js";
import { chunkSentences } from "./sentence-chunker.js";
import { VoiceSession, type SessionLogger, type SessionTimers } from "./voice-session.js";
import {
  ScriptedLlm,
  TestTransport,
  call,
  dbReachable,
  firstOpenDay,
  lastToolResult,
  makeDemoClinic,
  openDb,
  silentLog,
  sleep,
  waitFor,
} from "./test-helpers.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
if (!reachable) {
  console.warn(
    "WARNING: Postgres unreachable, skipping VoiceSession tests. Run: docker compose up -d && npm run db:migrate",
  );
}
afterAll(async () => {
  await pool.end();
});

(reachable ? describe : describe.skip)("VoiceSession", () => {
  let demo: Awaited<ReturnType<typeof makeDemoClinic>>;
  beforeAll(async () => {
    demo = await makeDemoClinic(db, "session");
  });
  afterAll(async () => {
    await demo?.cleanup();
  });

  async function setup(opts: {
    llm: ConstructorParameters<typeof Object>[0] & object;
    tts?: FakeTts;
    maxDurationS?: number;
    secondsRemaining?: number;
    timers?: SessionTimers;
    now?: () => Date;
    callId?: string;
    callerPhone?: string;
    channel?: "browser" | "phone" | "unset";
    waitListening?: boolean;
    clinic?: typeof demo.ctx;
    log?: SessionLogger;
    stt?: FakeStt;
    recordCalls?: boolean;
  }) {
    const transport = new TestTransport();
    const stt = opts.stt ?? new FakeStt();
    const tts = opts.tts ?? new FakeTts({ chunks: 2, delayMs: 1 });
    const callId = opts.callId ?? (await demo.newCall());
    const session = new VoiceSession({
      transport,
      stt,
      tts,
      llm: opts.llm as never,
      db,
      log: opts.log ?? silentLog,
      ...(opts.timers ? { timers: opts.timers } : {}),
      ctx: {
        clinic: opts.clinic ?? demo.ctx,
        callId,
        language: "en-IN",
        now: opts.now ?? (() => new Date()),
        maxDurationS: opts.maxDurationS ?? 600,
        secondsRemaining: opts.secondsRemaining ?? 3600,
        recordCalls: opts.recordCalls ?? false,
        ...(opts.callerPhone ? { callerPhone: opts.callerPhone } : {}),
        ...(opts.channel === "unset" ? {} : { channel: opts.channel ?? "browser" }),
      },
    });
    await session.start();
    if (opts.waitListening !== false) {
      await waitFor(
        () => transport.ofType("state").some((s) => s.state === "listening"),
        4000,
        "listening",
      );
    }
    const say = (text: string, language = "en-IN") => {
      stt.push({ type: "speech_start" });
      stt.push({ type: "speech_end" });
      stt.push({ type: "transcript", text, language });
    };
    return { transport, stt, tts, session, callId, say };
  }

  const bookingSteps = (date: string, extra: Array<(m: never) => never> = []) => {
    void extra;
    return [
      () => [call("t1", "get_clinic_info", {})],
      (m: any) => {
        const svc = lastToolResult(m)["services"][0].id as string;
        return [call("t2", "find_slots", { date, service_id: svc })];
      },
      (m: any) => {
        const r = lastToolResult(m);
        const slot = r["slots"][0];
        const svc = demo.ctx.services.find((s) => s.bookableByAi)!.id;
        return [
          call("t3", "book_appointment", {
            patient_name: "Test Patient",
            patient_phone: "+919876500001",
            doctor_id: slot.doctor_id,
            service_id: svc,
            starts_at: slot.starts_at,
          }),
        ];
      },
    ];
  };

  it("(a) scripted booking creates an appointment and a booking event", async () => {
    const { date } = await firstOpenDay(db, demo.ctx, new Date());
    // get_clinic_info lists services in context order; keep the booking service consistent with it.
    const llm = new ScriptedLlm([
      ...(bookingSteps(date) as never[]),
      () => [{ type: "text", text: "Booked. A confirmation will be sent." }],
    ]);
    const { transport, say, session } = await setup({ llm });
    say("I want a cleaning tomorrow afternoon");
    await waitFor(() => transport.ofType("booking").length === 1, 8000, "booking event");
    const rows = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.clinicId, demo.clinicId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("ai_call");
    expect(transport.ofType("booking")[0]!.appointmentId).toBe(rows[0]!.id);
    await waitFor(
      () =>
        transport
          .events()
          .filter((e) => e.type === "state")
          .at(-1)?.["state" as never] === "listening",
    );
    await session.end("caller");
    await db.delete(schema.appointments).where(eq(schema.appointments.clinicId, demo.clinicId));
  });

  it("(b) barge-in flushes playback and no audio follows", async () => {
    const tts = new FakeTts({ chunks: 50, delayMs: 10 });
    const llm = new FakeLlm({}, "This is a long answer for the caller. And another sentence here.");
    const { transport, stt, say, session } = await setup({ llm, tts });
    const base = transport.audioCount(); // greeting audio is already counted
    say("tell me about the clinic");
    await waitFor(() => transport.audioCount() > base + 2, 4000, "audio");
    stt.push({ type: "speech_start" });
    const flushIdx = transport.log.findLastIndex(
      (l) => l.kind === "event" && l.event.type === "flush_playback",
    );
    expect(flushIdx).toBeGreaterThan(-1);
    expect(transport.log.slice(flushIdx + 1).some((l) => l.kind === "audio")).toBe(false);
    await sleep(150);
    expect(transport.log.slice(flushIdx + 1).some((l) => l.kind === "audio")).toBe(false);
    expect(tts.cancelCalls).toBeGreaterThanOrEqual(1);
    expect(transport.ofType("state").at(-1)!.state).toBe("listening");
    await session.end("caller");
  });

  it("(c) an empty transcript does not call the LLM", async () => {
    const llm = new FakeLlm();
    const { stt, session, transport } = await setup({ llm });
    stt.push({ type: "speech_start" });
    stt.push({ type: "speech_end" });
    stt.push({ type: "transcript", text: "   " });
    await sleep(60);
    expect(llm.requests).toHaveLength(0);
    expect(transport.ofType("state").at(-1)!.state).toBe("listening");
    await session.end("caller");
    expect(transport.ofType("ended")[0]!.outcome).toBe("abandoned");
  });

  it("(d) end_call ends with reason assistant and outcome booked", async () => {
    const { date } = await firstOpenDay(db, demo.ctx, new Date());
    const llm = new ScriptedLlm([
      ...(bookingSteps(date) as never[]),
      () => [call("t4", "end_call", { summary: "booked cleaning" })],
      () => [{ type: "text", text: "Thank you, goodbye." }],
    ]);
    const { transport, say, callId } = await setup({ llm });
    say("book me a cleaning");
    await waitFor(() => transport.ofType("ended").length === 1, 10000, "ended");
    expect(transport.ofType("ended")[0]).toMatchObject({ reason: "assistant", outcome: "booked" });
    expect(transport.closed).toBe(true);
    const [row] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId));
    expect(row).toMatchObject({ status: "completed", outcome: "booked" });
    const turns = await db
      .select()
      .from(schema.callTurns)
      .where(eq(schema.callTurns.callId, callId));
    expect(turns.filter((t) => t.role === "tool").map((t) => t.toolName)).toContain(
      "book_appointment",
    );
    expect(turns.find((t) => t.role === "user")?.text).toBe("book me a cleaning");
    await db.delete(schema.appointments).where(eq(schema.appointments.clinicId, demo.clinicId));
  });

  it("(e) max duration ends with reason timeout", async () => {
    const { transport, callId } = await setup({ llm: new FakeLlm(), maxDurationS: 0.05 });
    await waitFor(() => transport.ofType("ended").length === 1, 3000, "ended");
    expect(transport.ofType("ended")[0]!.reason).toBe("timeout");
    const [row] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId));
    expect(row!.status).toBe("completed");
  });

  it("emits usage every 30 s and ends with reason cap (injected timers)", async () => {
    let clock = 1_000_000;
    type T = { at: number; fn: () => void; every?: number; id: number };
    let timers: T[] = [];
    let nextId = 1;
    const fake: SessionTimers = {
      setTimeout: (fn, ms) => {
        const t = { at: clock + ms, fn, id: nextId++ };
        timers.push(t);
        return t.id;
      },
      clearTimeout: (h) => void (timers = timers.filter((t) => t.id !== h)),
      setInterval: (fn, ms) => {
        const t = { at: clock + ms, fn, every: ms, id: nextId++ };
        timers.push(t);
        return t.id;
      },
      clearInterval: (h) => void (timers = timers.filter((t) => t.id !== h)),
    };
    const advance = async (ms: number) => {
      const target = clock + ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        clock = due.at;
        if (due.every) due.at += due.every;
        else timers = timers.filter((t) => t !== due);
        due.fn();
        await sleep(0);
      }
      clock = target;
    };
    const { transport } = await setup({
      llm: new FakeLlm(),
      timers: fake,
      secondsRemaining: 70,
      now: () => new Date(clock),
    });
    await advance(30_000);
    await advance(30_000);
    expect(transport.ofType("usage").map((u) => u.secondsRemaining)).toEqual([40, 10]);
    await advance(10_000);
    await waitFor(() => transport.ofType("ended").length === 1, 3000, "ended");
    expect(transport.ofType("ended")[0]!.reason).toBe("cap");
  });

  const userTexts = (m: any[]) =>
    m.flatMap((x) =>
      (x.content ?? []).flatMap((b: any) => (b.text && x.role === "user" ? [b.text] : [])),
    );
  const pairing = (m: any[]) => {
    const uses = m.flatMap((x) =>
      (x.content ?? []).flatMap((b: any) => (b.toolUse ? [b.toolUse.toolUseId] : [])),
    );
    const res = m.flatMap((x) =>
      (x.content ?? []).flatMap((b: any) => (b.toolResult ? [b.toolResult.toolUseId] : [])),
    );
    return { uses, res, alternates: m.every((x, i) => i === 0 || x.role !== m[i - 1].role) };
  };

  it("late barge-in: flushes buffered client audio shortly after the last chunk, not 10 s later", async () => {
    for (const [gapMs, expectFlush] of [
      [500, true],
      [10_000, false],
    ] as const) {
      let clock = Date.now();
      const { transport, stt, session } = await setup({
        llm: new FakeLlm(),
        now: () => new Date(clock),
      });
      expect(transport.ofType("flush_playback")).toHaveLength(0);
      clock += gapMs;
      stt.push({ type: "speech_start" });
      expect(transport.ofType("flush_playback")).toHaveLength(expectFlush ? 1 : 0);
      await session.end("caller");
    }
  });

  it("barge-in during tool execution: no extra LLM call, tool pairing kept, end_call cancelled", async () => {
    const llm = new ScriptedLlm([
      () => [call("c1", "end_call", { summary: "bye" })],
      () => [{ type: "text", text: "Sure, still here." }],
    ]);
    const { transport, stt, say, session } = await setup({ llm });
    transport.hook = (e) => {
      if (e.type === "tool" && e.status === "started") {
        transport.hook = undefined;
        stt.push({ type: "speech_start" }); // barge-in lands while the tool is about to run
      }
    };
    const requests: any[][] = [];
    const orig = llm.stream.bind(llm);
    llm.stream = (req: any) => {
      requests.push(structuredClone(req.messages));
      return orig(req);
    };
    say("goodbye");
    await waitFor(() => transport.ofType("flush_playback").length === 1, 4000, "flush");
    await sleep(100);
    expect(llm.calls).toBe(1);
    expect(transport.ofType("ended")).toHaveLength(0); // end_call did not hang up
    say("actually one more thing");
    await waitFor(() => llm.calls === 2, 4000, "second llm call");
    await sleep(150);
    expect(transport.ofType("ended")).toHaveLength(0);
    const p = pairing(requests[1]!);
    expect(p.uses).toEqual(p.res); // every toolUse has its toolResult
    expect(p.alternates).toBe(true);
    await session.end("caller");
  });

  it("tool-loop cap: speaks a fallback and hands off", async () => {
    let n = 0;
    const llm = {
      async *stream() {
        n++;
        yield call(`loop${n}`, "get_clinic_info", {});
        yield { type: "done" as const, stopReason: "tool_use" };
      },
    };
    const tts = new FakeTts({ chunks: 1, delayMs: 1 });
    const { transport, say, callId } = await setup({ llm, tts });
    say("hello");
    await waitFor(() => transport.ofType("ended").length === 1, 8000, "ended");
    expect(n).toBe(6);
    expect(transport.ofType("ended")[0]).toMatchObject({ reason: "assistant", outcome: "handoff" });
    expect(tts.spoken.at(-1)!.text).toContain("connect you to our staff");
    const [row] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId));
    expect(row!.outcome).toBe("handoff");
  });

  it("LLM stream error: speaks the fallback then ends with reason error", async () => {
    const llm = {
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new Error("boom");
      },
    };
    const tts = new FakeTts({ chunks: 1, delayMs: 1 });
    const { transport, say, callId } = await setup({ llm, tts });
    say("hello");
    await waitFor(() => transport.ofType("ended").length === 1, 4000, "ended");
    expect(tts.spoken.at(-1)!.text).toContain("connect you to our staff");
    expect(transport.ofType("error")[0]!.code).toBe("provider");
    expect(transport.ofType("ended")[0]!.reason).toBe("error");
    const [row] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId));
    expect(row!.status).toBe("failed");
  });

  it("two quick transcripts: one LLM call at a time, both utterances kept", async () => {
    let active = 0;
    let maxActive = 0;
    const seen: any[][] = [];
    const llm = {
      async *stream(req: any) {
        active++;
        maxActive = Math.max(maxActive, active);
        seen.push(structuredClone(req.messages));
        try {
          await sleep(30);
          yield { type: "text" as const, text: "Okay." };
          yield { type: "done" as const, stopReason: "end_turn" };
        } finally {
          active--;
        }
      },
    };
    const { transport, stt, session, callId } = await setup({ llm });
    stt.push({ type: "transcript", text: "first thing" });
    stt.push({ type: "transcript", text: "second thing" });
    await waitFor(
      () => transport.ofType("state").at(-1)?.state === "listening" && seen.length >= 1,
      4000,
      "settled",
    );
    await sleep(100);
    expect(maxActive).toBe(1);
    expect(seen).toHaveLength(1); // the superseded utterance is answered together with the newer one
    expect(userTexts(seen[0]!).join(" ")).toContain("first thing");
    expect(userTexts(seen[0]!).join(" ")).toContain("second thing");
    await session.end("caller");
    const turns = await db
      .select()
      .from(schema.callTurns)
      .where(eq(schema.callTurns.callId, callId));
    expect(
      turns
        .sort((a, b) => a.seq - b.seq)
        .filter((t) => t.role === "user")
        .map((t) => t.text),
    ).toEqual(["first thing", "second thing"]);
  });

  it("finishes the call exactly once however it is ended", async () => {
    const { transport, session } = await setup({ llm: new FakeLlm(), maxDurationS: 0.05 });
    await Promise.all([session.end("caller"), session.end("cap"), session.end("error")]);
    await sleep(120); // the max-duration timer must not fire a second end
    expect(transport.ofType("ended")).toHaveLength(1);
    expect(transport.ofType("ended")[0]!.reason).toBe("caller");
  });

  it("an appendTurn failure does not end the call", async () => {
    const llm = new FakeLlm();
    const { transport, say, session } = await setup({ llm, callId: "call_does_not_exist" });
    say("hello there");
    await waitFor(() => llm.requests.length === 1, 4000, "llm");
    await waitFor(() => transport.ofType("state").at(-1)?.state === "listening", 4000, "listening");
    say("and again");
    await waitFor(() => llm.requests.length === 2, 4000, "llm 2");
    expect(transport.ofType("ended")).toHaveLength(0);
    expect(transport.closed).toBe(false);
    await session.end("caller");
  });

  it("phone call with an unparseable caller id fails closed", async () => {
    const llm = new ScriptedLlm([
      () => [call("l1", "lookup_patient", { patient_phone: "+919876500011" })],
      () => [{ type: "text", text: "Let me transfer you." }],
    ]);
    const { transport, say, session } = await setup({ llm, callerPhone: "abc", channel: "phone" });
    say("what appointments do I have");
    await waitFor(() => llm.calls === 2, 4000, "second llm call");
    await waitFor(() => transport.ofType("tool").some((e) => e.status === "failed"), 4000, "tool");
    expect(transport.ofType("tool").at(-1)!.summary).toBe("verification_required");
    await session.end("caller");
  });

  it("browser call without caller id can claim a phone", async () => {
    const llm = new ScriptedLlm([
      () => [call("l1", "lookup_patient", { patient_phone: "+919876500011" })],
      () => [{ type: "text", text: "You have none." }],
    ]);
    const { transport, say, session } = await setup({ llm, channel: "browser" });
    say("what appointments do I have");
    await waitFor(() => transport.ofType("tool").some((e) => e.status === "done"), 4000, "tool");
    await session.end("caller");
  });

  for (const channel of ["phone", "unset"] as const) {
    it(`channel ${channel} without caller id refuses claims`, async () => {
      const llm = new ScriptedLlm([
        () => [call("l1", "lookup_patient", { patient_phone: "+919876500011" })],
        () => [{ type: "text", text: "Let me transfer you." }],
      ]);
      const { transport, say, session } = await setup({ llm, channel });
      say("what appointments do I have");
      await waitFor(
        () => transport.ofType("tool").some((e) => e.status === "failed"),
        4000,
        "tool",
      );
      expect(transport.ofType("tool").at(-1)!.summary).toBe("verification_required");
      await session.end("caller");
    });
  }

  it("a forced hang-up (tool cap) survives barge-in during the fallback", async () => {
    const llm = {
      async *stream() {
        yield call("x", "get_clinic_info", {});
        yield { type: "done" as const, stopReason: "tool_use" };
      },
    };
    const tts = new FakeTts({ chunks: 30, delayMs: 10 });
    const { transport, stt, say } = await setup({ llm, tts });
    transport.hook = (e) => {
      if (e.type === "transcript" && e.role === "assistant") {
        transport.hook = undefined;
        setTimeout(() => stt.push({ type: "speech_start" }), 30);
      }
    };
    say("hello");
    await waitFor(() => transport.ofType("ended").length === 1, 8000, "ended");
    expect(transport.ofType("ended")[0]).toMatchObject({ reason: "assistant", outcome: "handoff" });
  });

  it("recordCalls: speaks the recorded disclosure and taps caller audio, assistant audio and barge-in", async () => {
    const { transport, stt, session, tts, say } = await setup({
      llm: new FakeLlm(),
      recordCalls: true,
    });
    const { disclosure } = openingUtterances(demo.ctx.assistant, demo.ctx.clinic, "en-IN", {
      recorded: true,
    });
    expect(disclosure).toBe(DISCLOSURE_RECORDED["en-IN"]);
    expect(tts.spoken[0]!.text).toBe(DISCLOSURE_RECORDED["en-IN"]);
    expect(session.recorder).not.toBeNull();
    transport.feedAudio(Buffer.alloc(3200, 1));
    await sleep(20);
    expect(session.recorder!.bufferedBytes).toBeGreaterThan(3200); // caller + greeting audio
    stt.push({ type: "speech_start" });
    say("hello there");
    await waitFor(() => session.userTurns >= 1, 4000, "user turn");
    await session.end("caller");
    const r = await session.recorder!.finish();
    expect(r).not.toBeNull();
    await session.recorder!.discard();
  });

  it("recordCalls false: no recorder and the transcription-only disclosure", async () => {
    const { session, tts } = await setup({ llm: new FakeLlm() });
    expect(session.recorder).toBeNull();
    expect(tts.spoken[0]!.text).toBe(DISCLOSURE["en-IN"]);
    await session.end("caller");
  });

  it("always opens with the AI/transcription disclosure, as one persisted turn 0", async () => {
    const on = await setup({ llm: new FakeLlm() });
    const { disclosure, greeting } = openingUtterances(
      demo.ctx.assistant,
      demo.ctx.clinic,
      "en-IN",
      { recorded: false },
    );
    expect(disclosure).toBe(DISCLOSURE["en-IN"]);
    expect(on.tts.spoken.map((x) => x.text)).toEqual([disclosure, greeting]);
    await on.session.end("caller");
    const rows = await db
      .select()
      .from(schema.callTurns)
      .where(eq(schema.callTurns.callId, on.callId));
    expect(rows.find((r) => r.seq === 0)!.text).toBe(`${disclosure} ${greeting}`);
  });

  it("ignores barge-in until the disclosure has been sent", async () => {
    const s = await setup({
      llm: new FakeLlm(),
      tts: new FakeTts({ chunks: 4, delayMs: 30 }),
      waitListening: false,
    });
    s.stt.push({ type: "speech_start" });
    s.stt.push({ type: "speech_end" });
    s.stt.push({ type: "transcript", text: "hello", language: "en-IN" });
    await waitFor(() => s.tts.spoken.length === 2, 4000, "greeting spoken");
    expect(s.transport.ofType("flush_playback")).toHaveLength(0);
    // the caller's words are kept (not dropped) even though barge-in was ignored
    await waitFor(
      () => s.transport.ofType("transcript").some((t) => t.role === "user" && t.text === "hello"),
      4000,
      "user transcript",
    );
    expect(s.tts.spoken[0]!.text).toBe(DISCLOSURE["en-IN"]);
    await s.session.end("caller");
  });

  const toolResultsIn = (m: any[]) =>
    m.flatMap((x) =>
      (x.content ?? []).flatMap((b: any) =>
        b.toolResult ? [{ id: b.toolResult.toolUseId, text: b.toolResult.content[0].text }] : [],
      ),
    );

  it("tool batch: calls after a barge-in are answered 'interrupted' and never executed", async () => {
    const llm = new ScriptedLlm([
      () => [
        call("b1", "get_clinic_info", {}),
        call("b2", "end_call", { summary: "x" }),
        call("b3", "get_clinic_info", {}),
      ],
      () => [{ type: "text", text: "Still here." }],
    ]);
    const { transport, stt, say, session } = await setup({ llm });
    const requests: any[][] = [];
    const orig = llm.stream.bind(llm);
    llm.stream = (req: any) => {
      requests.push(structuredClone(req.messages));
      return orig(req);
    };
    transport.hook = (e) => {
      if (e.type === "tool" && e.status === "started") {
        transport.hook = undefined;
        stt.push({ type: "speech_start" }); // caller barges in while the first tool runs
      }
    };
    say("hello");
    await waitFor(() => transport.ofType("flush_playback").length === 1, 4000, "flush");
    await sleep(100);
    expect(transport.ofType("tool").filter((t) => t.status === "started")).toHaveLength(1);
    expect(transport.ofType("ended")).toHaveLength(0); // the queued end_call never ran
    say("one more thing");
    await waitFor(() => llm.calls === 2, 4000, "second llm call");
    const p = pairing(requests[1]!);
    expect(p.uses).toEqual(["b1", "b2", "b3"]);
    expect(p.res).toEqual(["b1", "b2", "b3"]);
    const results = toolResultsIn(requests[1]!);
    expect(results[1]!.text).toContain("interrupted");
    expect(results[2]!.text).toContain("interrupted");
    await session.end("caller");
  });

  it("tool batch: at most 3 calls run per LLM round, extras get too_many_tools", async () => {
    const llm = new ScriptedLlm([
      () => [1, 2, 3, 4, 5].map((i) => call(`m${i}`, "get_clinic_info", {})),
      () => [{ type: "text", text: "Done." }],
    ]);
    const { transport, say, session } = await setup({ llm });
    const requests: any[][] = [];
    const orig = llm.stream.bind(llm);
    llm.stream = (req: any) => {
      requests.push(structuredClone(req.messages));
      return orig(req);
    };
    say("hello");
    await waitFor(() => llm.calls === 2, 4000, "second llm call");
    expect(transport.ofType("tool").filter((t) => t.status === "started")).toHaveLength(3);
    const results = toolResultsIn(requests[1]!);
    expect(results.map((r) => r.id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    expect(results.slice(0, 3).every((r) => !r.text.includes("too_many_tools"))).toBe(true);
    expect(results[3]!.text).toContain("too_many_tools");
    expect(results[4]!.text).toContain("too_many_tools");
    expect(pairing(requests[1]!).uses).toEqual(pairing(requests[1]!).res);
    await session.end("caller");
  });

  it("a TTS failure skips that utterance and keeps the call going", async () => {
    const tts = new FakeTts({ chunks: 1, delayMs: 1, failWhen: (t) => t.includes("Okay") });
    const llm = new FakeLlm();
    const { transport, say, session } = await setup({ llm, tts });
    say("hello");
    await waitFor(() => llm.requests.length === 1, 4000, "llm");
    await waitFor(() => transport.ofType("state").at(-1)?.state === "listening", 4000, "listening");
    expect(transport.ofType("ended")).toHaveLength(0);
    expect(transport.ofType("error")).toHaveLength(0);
    say("and again");
    await waitFor(() => llm.requests.length === 2, 4000, "llm 2");
    await waitFor(() => tts.spoken.filter((s) => s.text.includes("Okay")).length === 2, 4000);
    expect(transport.closed).toBe(false);
    await session.end("caller");
  });

  it("an STT drop reconnects once and the call continues on the new stream", async () => {
    const llm = new FakeLlm();
    const stt = new FakeStt();
    const { transport, session, say } = await setup({ llm, stt });
    stt.push({ type: "error", error: new Error("socket dropped") });
    await waitFor(() => stt.streams.length === 2, 2000, "reconnect");
    expect(stt.streams[0]!.closed).toBe(true);
    await sleep(20); // handlers attach once open() resolves
    expect(transport.ofType("ended")).toHaveLength(0);
    say("hello after reconnect");
    await waitFor(() => llm.requests.length === 1, 4000, "llm");
    await session.end("caller");
  });

  it("a failed STT reconnect speaks the trouble line and ends with reason error, keeping the outcome", async () => {
    const { date } = await firstOpenDay(db, demo.ctx, new Date());
    const llm = new ScriptedLlm([
      ...(bookingSteps(date) as never[]),
      () => [{ type: "text", text: "Booked." }],
    ]);
    const stt = new FakeStt();
    const tts = new FakeTts({ chunks: 1, delayMs: 1 });
    const { transport, say, callId } = await setup({ llm, stt, tts });
    say("book me");
    await waitFor(() => transport.ofType("booking").length === 1, 8000, "booking");
    await waitFor(() => transport.ofType("state").at(-1)?.state === "listening", 4000, "listening");
    stt.failNextOpens = 1;
    stt.push({ type: "error", error: new Error("socket dropped") });
    await waitFor(() => transport.ofType("ended").length === 1, 4000, "ended");
    expect(transport.ofType("ended")[0]).toMatchObject({ reason: "error", outcome: "booked" });
    expect(tts.spoken.at(-1)!.text).toContain("having trouble hearing you");
    expect(tts.spoken.at(-1)!.text).toContain("call the clinic directly");
    const [row] = await db.select().from(schema.calls).where(eq(schema.calls.id, callId));
    expect(row!.outcome).toBe("booked");
  });

  it("logs one structured line per turn with timings only", async () => {
    const lines: Array<{ msg: string; fields?: Record<string, unknown> }> = [];
    const log: SessionLogger = {
      info: (msg, fields) => void lines.push({ msg, ...(fields ? { fields } : {}) }),
      warn() {},
      error() {},
    };
    const llm = new FakeLlm({}, "Secret reply text.");
    const { transport, say, session } = await setup({ llm, log });
    say("my private words");
    await waitFor(() => transport.ofType("state").at(-1)?.state === "listening", 4000);
    await waitFor(() => lines.some((l) => l.msg === "turn"), 4000, "turn log");
    const turn = lines.filter((l) => l.msg === "turn");
    expect(turn).toHaveLength(1);
    expect(Object.keys(turn[0]!.fields!).sort()).toEqual([
      "llmFirstTokenMs",
      "sttMs",
      "ttsFirstAudioMs",
      "turn",
    ]);
    expect(turn[0]!.fields!["turn"]).toBe(1);
    for (const k of ["llmFirstTokenMs", "ttsFirstAudioMs"])
      expect(typeof turn[0]!.fields![k]).toBe("number");
    expect(JSON.stringify(lines)).not.toMatch(/private words|Secret reply/);
    await session.end("caller");
  });

  it("splits PCM16 audio on even byte boundaries when the provider sends an odd chunk", async () => {
    const tts = new FakeTts({ chunks: 3, chunkBytes: 5, delayMs: 1 });
    const { transport, session } = await setup({ llm: new FakeLlm(), tts });
    const sizes = transport.log.flatMap((l) => (l.kind === "audio" ? [l.bytes] : []));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.every((n) => n % 2 === 0)).toBe(true);
    await session.end("caller");
  });

  it.each(["hi-IN", "kn-IN", "ta-IN", "te-IN", "en-IN"] as const)(
    "keeps the %s disclosure whole and in order through chunkSentences",
    async (lang) => {
      const text = DISCLOSURE[lang];
      async function* slices() {
        for (let i = 0; i < text.length; i += 7) yield text.slice(i, i + 7);
      }
      const out: string[] = [];
      for await (const c of chunkSentences(slices())) out.push(c);
      expect(out.join(" ").replace(/\s+/g, " ").trim()).toBe(text);
    },
  );
});
