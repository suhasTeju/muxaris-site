/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { FakeLlm, FakeStt, FakeTts } from "../providers/fakes.js";
import { DISCLOSURE } from "./prompt.js";
import { VoiceSession, type SessionTimers } from "./voice-session.js";
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
  }) {
    const transport = new TestTransport();
    const stt = new FakeStt();
    const tts = opts.tts ?? new FakeTts({ chunks: 2, delayMs: 1 });
    const callId = opts.callId ?? (await demo.newCall());
    const session = new VoiceSession({
      transport,
      stt,
      tts,
      llm: opts.llm as never,
      db,
      log: silentLog,
      ...(opts.timers ? { timers: opts.timers } : {}),
      ctx: {
        clinic: opts.clinic ?? demo.ctx,
        callId,
        language: "en-IN",
        now: opts.now ?? (() => new Date()),
        maxDurationS: opts.maxDurationS ?? 600,
        secondsRemaining: opts.secondsRemaining ?? 3600,
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

  it("opens with the AI/transcription disclosure, unless switched off", async () => {
    const on = await setup({ llm: new FakeLlm() });
    const d = DISCLOSURE["en-IN"];
    expect(on.tts.spoken[0]!.text).toBe(d);
    expect(on.tts.spoken).toHaveLength(2);
    await on.session.end("caller");
    const rows = await db
      .select()
      .from(schema.callTurns)
      .where(eq(schema.callTurns.callId, on.callId));
    expect(rows.find((r) => r.seq === 0)!.text!.startsWith(d)).toBe(true);

    const off = await setup({
      llm: new FakeLlm(),
      clinic: {
        ...demo.ctx,
        assistant: { ...demo.ctx.assistant!, settings: { disclosure: false } } as never,
      },
    });
    expect(off.tts.spoken).toHaveLength(1);
    expect(off.tts.spoken[0]!.text).not.toContain(d);
    await off.session.end("caller");
  });
});
