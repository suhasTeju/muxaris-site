import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookAppointment } from "@muxaris/core";
import { schema } from "@muxaris/db";
import { executeTool, type ToolContext } from "./tools.js";
import { dbReachable, firstOpenDay, makeDemoClinic, openDb } from "./test-helpers.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
if (!reachable) {
  console.warn("WARNING: Postgres unreachable, skipping executeTool tests.");
}
afterAll(async () => {
  await pool.end();
});

const PHONE_A = "+919876500011";
const PHONE_B = "+919876500022";

(reachable ? describe : describe.skip)("executeTool", () => {
  let a: Awaited<ReturnType<typeof makeDemoClinic>>;
  let b: Awaited<ReturnType<typeof makeDemoClinic>>;
  let day: Awaited<ReturnType<typeof firstOpenDay>>;
  let aptId: string;
  const now = new Date();

  const ctxFor = (over: Partial<ToolContext> = {}): ToolContext => ({
    clinic: a.ctx,
    callId: "call_x",
    language: "en-IN",
    now: () => now,
    ...over,
  });

  beforeAll(async () => {
    a = await makeDemoClinic(db, "toolsA");
    b = await makeDemoClinic(db, "toolsB");
    day = await firstOpenDay(db, a.ctx, now);
    const slot = day.slots[0]!;
    const apt = await bookAppointment(db, {
      clinicId: a.clinicId,
      patient: { phone: PHONE_A, name: "Secret Name" },
      doctorId: slot.doctorId,
      serviceId: day.service.id,
      startsAt: slot.startsAt,
      source: "ai_call",
      notes: "private note",
    });
    aptId = apt.id;
  });
  afterAll(async () => {
    await a?.cleanup();
    await b?.cleanup();
  });

  it("refuses an unavailable slot and offers up to 3 alternatives", async () => {
    const out = await executeTool(db, ctxFor(), "book_appointment", {
      patient_name: "X",
      patient_phone: PHONE_B,
      doctor_id: day.slots[0]!.doctorId,
      service_id: day.service.id,
      starts_at: `${day.date}T03:00:00+05:30`,
    });
    const r = out.result as { error: string; alternatives: unknown[] };
    expect(r.error).toBe("slot_unavailable");
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(r.alternatives.length).toBeLessThanOrEqual(3);
    expect(out.event).toBeUndefined();
  });

  it("refuses a doctor id from another clinic", async () => {
    const foreign = b.ctx.doctors[0]!.id;
    const out = await executeTool(db, ctxFor(), "book_appointment", {
      patient_name: "X",
      patient_phone: PHONE_B,
      doctor_id: foreign,
      service_id: day.service.id,
      starts_at: day.slots[1]!.startsAt.toISOString(),
    });
    expect((out.result as { error: string }).error).toBe("not_found");
    expect(out.event).toBeUndefined();
  });

  it("rejects malformed input without throwing", async () => {
    const out = await executeTool(db, ctxFor(), "find_slots", { date: "tomorrow" });
    expect((out.result as { error: string }).error).toBe("invalid_input");
  });

  it("lookup_patient never returns the patient name or notes", async () => {
    const out = await executeTool(db, ctxFor(), "lookup_patient", { patient_phone: PHONE_A });
    const r = out.result as { found: boolean; appointments: Array<Record<string, unknown>> };
    expect(r.found).toBe(true);
    expect(r.appointments).toHaveLength(1);
    expect(Object.keys(r.appointments[0]!).sort()).toEqual(
      ["appointment_id", "doctor_name", "local_time", "service_name", "starts_at"].sort(),
    );
    expect(JSON.stringify(out.result)).not.toMatch(/Secret|private/);
    const none = await executeTool(db, ctxFor(), "lookup_patient", { patient_phone: PHONE_B });
    expect(none.result).toEqual({ found: false });
  });

  it("cancel without any bound phone requires verification", async () => {
    const out = await executeTool(db, ctxFor(), "cancel_appointment", { appointment_id: aptId });
    expect((out.result as { error: string }).error).toBe("verification_required");
  });

  it("cancel of another phone's appointment is not_found", async () => {
    const out = await executeTool(db, ctxFor({ claimedPhone: PHONE_B }), "cancel_appointment", {
      appointment_id: aptId,
    });
    expect((out.result as { error: string }).error).toBe("not_found");
    const [row] = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.id, aptId));
    expect(row!.status).not.toBe("cancelled");
  });

  it("a phone that does not match the caller id is refused", async () => {
    const ctx = ctxFor({ callerPhone: PHONE_B });
    const l = await executeTool(db, ctx, "lookup_patient", { patient_phone: PHONE_A });
    expect((l.result as { error: string }).error).toBe("verification_required");
    expect(JSON.stringify(l.result)).not.toMatch(/appointment_id/);
    const c = await executeTool(db, ctx, "cancel_appointment", { appointment_id: aptId });
    expect((c.result as { error: string }).error).toBe("not_found");
  });

  it("the first claimed phone is remembered and the owner can cancel", async () => {
    const ctx = ctxFor();
    await executeTool(db, ctx, "lookup_patient", { patient_phone: PHONE_A });
    expect(ctx.claimedPhone).toBe(PHONE_A);
    const other = await executeTool(db, ctx, "lookup_patient", { patient_phone: PHONE_B });
    expect((other.result as { error: string }).error).toBe("verification_required");
    const out = await executeTool(db, ctx, "cancel_appointment", { appointment_id: aptId });
    expect(out.result).toMatchObject({ cancelled: true });
  });

  it("book_appointment for a phone other than the bound one is refused", async () => {
    const ctx = ctxFor();
    await executeTool(db, ctx, "lookup_patient", { patient_phone: PHONE_A });
    const slot = day.slots[2] ?? day.slots[1]!;
    const base = {
      patient_name: "Z",
      doctor_id: slot.doctorId,
      service_id: day.service.id,
      starts_at: slot.startsAt.toISOString(),
    };
    const other = await executeTool(db, ctx, "book_appointment", {
      ...base,
      patient_phone: PHONE_B,
    });
    expect((other.result as { error: string }).error).toBe("verification_required");
    expect(other.event).toBeUndefined();
    const own = await executeTool(db, ctx, "book_appointment", { ...base, patient_phone: PHONE_A });
    expect(own.result).toMatchObject({ booked: true });
    expect(own.event?.type).toBe("booking");
  });

  it("verifiedPhone takes precedence and caller id formats are normalised", async () => {
    const ctx = ctxFor({ callerPhone: "919876500022", verifiedPhone: "+919876500011" });
    const mismatch = await executeTool(db, ctx, "lookup_patient", { patient_phone: PHONE_B });
    expect((mismatch.result as { error: string }).error).toBe("verification_required");
    const ok = await executeTool(db, ctx, "lookup_patient", { patient_phone: PHONE_A });
    expect((ok.result as { found: boolean }).found).toBe(true);
    const caller = ctxFor({ callerPhone: "919876500011" });
    const viaCaller = await executeTool(db, caller, "lookup_patient", { patient_phone: PHONE_A });
    expect((viaCaller.result as { found: boolean }).found).toBe(true);
  });

  it("identityUnverifiable refuses lookup, book and cancel", async () => {
    const ctx = ctxFor({ identityUnverifiable: true });
    for (const [name, input] of [
      ["lookup_patient", { patient_phone: PHONE_A }],
      ["cancel_appointment", { appointment_id: aptId }],
    ] as const) {
      const out = await executeTool(db, ctx, name, input);
      expect((out.result as { error: string }).error).toBe("verification_required");
    }
    const slot = day.slots[1]!;
    const b = await executeTool(db, ctx, "book_appointment", {
      patient_name: "Q",
      patient_phone: PHONE_B,
      doctor_id: slot.doctorId,
      service_id: day.service.id,
      starts_at: slot.startsAt.toISOString(),
    });
    expect((b.result as { error: string }).error).toBe("verification_required");
    expect(ctx.claimedPhone).toBeUndefined();
  });
});
