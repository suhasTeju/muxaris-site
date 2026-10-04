/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@muxaris/db";
import { FakeLlm, FakeStt, FakeTts } from "../providers/fakes.js";
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
  }) {
    const transport = new TestTransport();
    const stt = new FakeStt();
    const tts = opts.tts ?? new FakeTts({ chunks: 2, delayMs: 1 });
    const callId = await demo.newCall();
    const session = new VoiceSession({
      transport,
      stt,
      tts,
      llm: opts.llm as never,
      db,
      log: silentLog,
      ...(opts.timers ? { timers: opts.timers } : {}),
      ctx: {
        clinic: demo.ctx,
        callId,
        language: "en-IN",
        now: opts.now ?? (() => new Date()),
        maxDurationS: opts.maxDurationS ?? 600,
        secondsRemaining: opts.secondsRemaining ?? 3600,
      },
    });
    await session.start();
    await waitFor(
      () => transport.ofType("state").some((s) => s.state === "listening"),
      4000,
      "listening",
    );
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
    const flushIdx = transport.log.findIndex(
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
});
