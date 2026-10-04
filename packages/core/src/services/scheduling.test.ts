import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { DEMO_CLINIC_ID, seedDemoClinic } from "@muxaris/db";
import {
  bookAppointment,
  cancelAppointment,
  createDoctor,
  createService,
  findAvailableSlots,
  getSlotRules,
  listAppointments,
  listDoctors,
  listServices,
  rescheduleAppointment,
  setWorkingHours,
  updateSlotRules,
} from "./scheduling.js";
import { loadDemoClinicData } from "./demo.js";
import { atLocal } from "../scheduling/time.js";
import {
  dbReachable,
  makeTestClinic,
  openDb,
  warnIfUnreachable,
  TEST_DB_URL,
} from "./test-support.js";
import { createDb } from "@muxaris/db";

const { db, pool } = openDb();
const reachable = await dbReachable();
warnIfUnreachable(reachable, "core scheduling tests");

/** The next date (>= 2 days ahead, IST) with the given weekday (0=Sun). */
function nextWeekday(weekday: number): string {
  let d = addDays(new TZDate(new Date(), "Asia/Kolkata"), 2);
  while (d.getDay() !== weekday) d = addDays(d, 1);
  return format(d, "yyyy-MM-dd");
}
const TUESDAY = nextWeekday(2);
const at = (date: string, hhmm: string) => atLocal(date, hhmm, "Asia/Kolkata");

(reachable ? describe : describe.skip)("scheduling service", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  let b: Awaited<ReturnType<typeof makeTestClinic>>;
  let aDocs: Array<{ id: string }>;
  let aSvc: { id: string; durationMin: number; bufferMin: number };
  let bDoc: { id: string };
  let bSvc: { id: string };
  const patient = { phone: "+919800000001", name: "Asha" };

  beforeAll(async () => {
    await seedDemoClinic(db);
    a = await makeTestClinic(db, "sched-a");
    b = await makeTestClinic(db, "sched-b");
    await loadDemoClinicData(db, a.clinic.id);
    aDocs = await listDoctors(db, a.clinic.id);
    const svcs = await listServices(db, a.clinic.id);
    aSvc = svcs.find((s) => s.name === "Consultation")!; // 20 min + 5 buffer
    bDoc = await createDoctor(db, b.clinic.id, { name: "Dr B" });
    bSvc = await createService(db, b.clinic.id, { name: "Check", durationMin: 15 });
  });
  afterAll(async () => {
    await a?.cleanup();
    await b?.cleanup();
    await pool.end();
  });

  it("returns slots for both doctors on the demo clinic for Tuesday afternoon", async () => {
    const slots = await findAvailableSlots(db, {
      clinicId: DEMO_CLINIC_ID,
      date: TUESDAY,
      serviceId: "svc_demo_consult",
      partOfDay: "afternoon",
    });
    expect(new Set(slots.map((s) => s.doctorId))).toEqual(
      new Set(["doc_demo_rao", "doc_demo_shetty"]),
    );
    expect(slots.every((s) => s.startsAt.getTime() >= at(TUESDAY, "12:00").getTime())).toBe(true);
  });

  it("validates date and scopes service/doctor by clinic", async () => {
    await expect(
      findAvailableSlots(db, { clinicId: a.clinic.id, date: "2026-13-45", serviceId: aSvc.id }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      findAvailableSlots(db, { clinicId: a.clinic.id, date: TUESDAY, serviceId: bSvc.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      findAvailableSlots(db, {
        clinicId: a.clinic.id,
        date: TUESDAY,
        serviceId: aSvc.id,
        doctorId: bDoc.id,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("books, then hides the slot including the service buffer", async () => {
    const doctorId = aDocs[0]!.id;
    const start = at(TUESDAY, "10:00");
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient,
      doctorId,
      serviceId: aSvc.id,
      startsAt: start,
      source: "dashboard",
    });
    expect(apt.status).toBe("scheduled");
    expect(apt.endsAt.getTime() - start.getTime()).toBe(20 * 60_000);
    const slots = await findAvailableSlots(db, {
      clinicId: a.clinic.id,
      date: TUESDAY,
      serviceId: aSvc.id,
      doctorId,
    });
    const starts = slots.map((s) => s.startsAt.getTime());
    expect(starts).not.toContain(at(TUESDAY, "10:00").getTime());
    expect(starts).not.toContain(at(TUESDAY, "10:15").getTime());
    expect(starts).toContain(at(TUESDAY, "10:30").getTime()); // 10:00 + 20 + 5 buffer = 10:25 -> grid 10:30
    // 10:15 is rejected, and so is 09:45 (its own 25 min need overlaps 10:00)
    await expect(
      bookAppointment(db, {
        clinicId: a.clinic.id,
        patient,
        doctorId,
        serviceId: aSvc.id,
        startsAt: at(TUESDAY, "10:15"),
        source: "dashboard",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      await listAppointments(db, {
        clinicId: a.clinic.id,
        from: at(TUESDAY, "00:00"),
        to: at(TUESDAY, "23:59"),
      }),
    ).toHaveLength(1);
  });

  it("rejects a doctor/service/appointment from another clinic as not_found", async () => {
    await expect(
      bookAppointment(db, {
        clinicId: a.clinic.id,
        patient,
        doctorId: bDoc.id,
        serviceId: aSvc.id,
        startsAt: at(TUESDAY, "15:00"),
        source: "dashboard",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      bookAppointment(db, {
        clinicId: a.clinic.id,
        patient,
        doctorId: aDocs[0]!.id,
        serviceId: bSvc.id,
        startsAt: at(TUESDAY, "15:00"),
        source: "dashboard",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient,
      doctorId: aDocs[1]!.id,
      serviceId: aSvc.id,
      startsAt: at(TUESDAY, "16:00"),
      source: "dashboard",
    });
    await expect(
      rescheduleAppointment(db, {
        clinicId: b.clinic.id,
        appointmentId: apt.id,
        newStartsAt: at(TUESDAY, "17:00"),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      cancelAppointment(db, { clinicId: b.clinic.id, appointmentId: apt.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(setWorkingHours(db, b.clinic.id, aDocs[0]!.id, [])).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("serialises a race for the same slot: one wins, one conflicts", async () => {
    const second = createDb(TEST_DB_URL);
    try {
      const doctorId = aDocs[0]!.id;
      const mk = (d: typeof db, phone: string) =>
        bookAppointment(d, {
          clinicId: a.clinic.id,
          patient: { phone },
          doctorId,
          serviceId: aSvc.id,
          startsAt: at(TUESDAY, "18:00"),
          source: "ai_call",
        });
      const results = await Promise.allSettled([
        mk(db, "+919800000010"),
        mk(second.db, "+919800000011"),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const bad = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok).toHaveLength(1);
      expect(bad).toHaveLength(1);
      expect(bad[0]!.reason).toMatchObject({ code: "conflict" });
    } finally {
      await second.pool.end();
    }
  });

  it("enforces maxPerSlot as an additional cap (exact same start)", async () => {
    await updateSlotRules(db, a.clinic.id, { maxPerSlot: 2 });
    expect((await getSlotRules(db, a.clinic.id)).maxPerSlot).toBe(2);
    await expect(
      bookAppointment(db, {
        clinicId: a.clinic.id,
        patient: { phone: "+919800000012" },
        doctorId: aDocs[0]!.id,
        serviceId: aSvc.id,
        startsAt: at(TUESDAY, "18:00"),
        source: "ai_call",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await updateSlotRules(db, a.clinic.id, { maxPerSlot: 1 });
  });

  it("reschedules and cancels, freeing the slot", async () => {
    const doctorId = aDocs[1]!.id;
    const apt = await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919800000020" },
      doctorId,
      serviceId: aSvc.id,
      startsAt: at(TUESDAY, "12:00"),
      source: "web",
    });
    const moved = await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      newStartsAt: at(TUESDAY, "13:00"),
    });
    expect(moved.status).toBe("rescheduled");
    expect(moved.startsAt.getTime()).toBe(at(TUESDAY, "13:00").getTime());
    // moving onto an occupied slot conflicts (16:00 booked earlier for this doctor)
    await expect(
      rescheduleAppointment(db, {
        clinicId: a.clinic.id,
        appointmentId: apt.id,
        newStartsAt: at(TUESDAY, "16:00"),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    // moving within its own old window is allowed (excludes itself)
    await rescheduleAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      newStartsAt: at(TUESDAY, "13:10"),
    });
    const cancelled = await cancelAppointment(db, {
      clinicId: a.clinic.id,
      appointmentId: apt.id,
      reason: "patient asked",
    });
    expect(cancelled.status).toBe("cancelled");
    await expect(
      rescheduleAppointment(db, {
        clinicId: a.clinic.id,
        appointmentId: apt.id,
        newStartsAt: at(TUESDAY, "14:00"),
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    // slot is free again
    await bookAppointment(db, {
      clinicId: a.clinic.id,
      patient: { phone: "+919800000021" },
      doctorId,
      serviceId: aSvc.id,
      startsAt: at(TUESDAY, "13:10"),
      source: "web",
    });
  });

  it("updateSlotRules ignores clinicId smuggled in the patch (mass assignment)", async () => {
    const before = await getSlotRules(db, b.clinic.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateSlotRules(db, a.clinic.id, { clinicId: b.clinic.id, slotGrainMin: 20 } as any);
    expect((await getSlotRules(db, b.clinic.id)).slotGrainMin).toBe(before.slotGrainMin);
    expect((await getSlotRules(db, a.clinic.id)).slotGrainMin).toBe(20);
    await updateSlotRules(db, a.clinic.id, { slotGrainMin: 15 });
  });

  it("validates working hours", async () => {
    await expect(
      setWorkingHours(db, a.clinic.id, aDocs[0]!.id, [
        { weekday: 9, startTime: "10:00", endTime: "12:00" },
      ]),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      setWorkingHours(db, a.clinic.id, aDocs[0]!.id, [
        { weekday: 1, startTime: "12:00", endTime: "10:00" },
      ]),
    ).rejects.toMatchObject({ code: "validation" });
  });
});
