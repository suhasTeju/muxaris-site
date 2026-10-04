import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { schema, newId } from "@muxaris/db";
import { bookAppointment, listDoctors, listServices, rescheduleAppointment } from "./scheduling.js";
import { loadDemoClinicData } from "./demo.js";
import { atLocal } from "../scheduling/time.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
warnIfUnreachable(reachable, "slot validation tests");

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
/** A Tuesday between 2 and 8 days ahead (IST). */
function nextTuesday(): Date {
  let d = addDays(new TZDate(new Date(), "Asia/Kolkata"), 2);
  while (d.getDay() !== 2) d = addDays(d, 1);
  return d;
}
const TUE = nextTuesday();
const at = (date: Date, hhmm: string) => atLocal(ymd(date), hhmm, "Asia/Kolkata");

(reachable ? describe : describe.skip)("booking validates slot rules", () => {
  let c: Awaited<ReturnType<typeof makeTestClinic>>;
  let doctorId: string;
  let serviceId: string;
  const patient = { phone: "+919800000099", name: "Ravi" };
  const book = (startsAt: Date, extra: Record<string, unknown> = {}) =>
    bookAppointment(db, {
      clinicId: c.clinic.id,
      patient,
      doctorId,
      serviceId,
      startsAt,
      source: "dashboard",
      ...extra,
    });
  const unavailable = (reason: string) =>
    expect.objectContaining({ code: "slot_unavailable", reason });

  beforeAll(async () => {
    c = await makeTestClinic(db, "slotval");
    await loadDemoClinicData(db, c.clinic.id);
    doctorId = (await listDoctors(db, c.clinic.id))[0]!.id;
    serviceId = (await listServices(db, c.clinic.id)).find((s) => s.name === "Consultation")!.id;
    await db.insert(schema.clinicHolidays).values({
      id: newId("hol"),
      clinicId: c.clinic.id,
      date: ymd(addDays(TUE, 7)),
      name: "Test holiday",
    });
    await db.insert(schema.timeOff).values({
      id: newId("toff"),
      clinicId: c.clinic.id,
      doctorId,
      startsAt: at(addDays(TUE, 14), "11:00"),
      endsAt: at(addDays(TUE, 14), "12:00"),
    });
  });
  afterAll(async () => {
    await c?.cleanup();
    await pool.end();
  });

  it("accepts an offered slot", async () => {
    const apt = await book(at(TUE, "10:00"));
    expect(apt.status).toBe("scheduled");
  });

  it("outside_hours", async () => {
    await expect(book(at(TUE, "03:00"))).rejects.toEqual(unavailable("outside_hours"));
    await expect(book(at(TUE, "19:50"))).rejects.toEqual(unavailable("outside_hours"));
  });

  it("outside_hours on a day without hours (Sunday)", async () => {
    await expect(book(at(addDays(TUE, 5), "11:00"))).rejects.toEqual(unavailable("outside_hours"));
  });

  it("holiday", async () => {
    await expect(book(at(addDays(TUE, 7), "11:00"))).rejects.toEqual(unavailable("holiday"));
  });

  it("time_off", async () => {
    await expect(book(at(addDays(TUE, 14), "11:15"))).rejects.toEqual(unavailable("time_off"));
  });

  it("lead_time", async () => {
    const now = at(TUE, "09:30"); // lead time is 60 min
    await expect(book(at(TUE, "10:15"), { now })).rejects.toEqual(unavailable("lead_time"));
  });

  it("too_far_ahead", async () => {
    await expect(book(at(addDays(TUE, 42), "11:00"))).rejects.toEqual(unavailable("too_far_ahead"));
  });

  it("past", async () => {
    await expect(book(at(addDays(TUE, -30), "11:00"))).rejects.toEqual(unavailable("past"));
  });

  it("not_on_grain", async () => {
    await expect(book(at(TUE, "11:07"))).rejects.toEqual(unavailable("not_on_grain"));
    await expect(book(new Date(at(TUE, "11:00").getTime() + 1500))).rejects.toEqual(
      unavailable("not_on_grain"),
    );
  });

  it("conflict", async () => {
    await expect(book(at(TUE, "10:00"))).rejects.toEqual(unavailable("conflict"));
  });

  it("the voice path (ai_call) rejects an off-hours time", async () => {
    await expect(
      bookAppointment(db, {
        clinicId: c.clinic.id,
        patient,
        doctorId,
        serviceId,
        startsAt: at(TUE, "03:00"),
        source: "ai_call",
      }),
    ).rejects.toEqual(unavailable("outside_hours"));
  });

  it("allowOutsideRules bypasses hours/lead/grain but never conflicts, holidays or time off", async () => {
    const early = await book(at(TUE, "08:07"), { allowOutsideRules: true });
    expect(early.startsAt.getTime()).toBe(at(TUE, "08:07").getTime());
    await expect(book(at(TUE, "08:10"), { allowOutsideRules: true })).rejects.toEqual(
      unavailable("conflict"),
    );
    await expect(book(at(addDays(TUE, 7), "11:00"), { allowOutsideRules: true })).rejects.toEqual(
      unavailable("holiday"),
    );
    await expect(book(at(addDays(TUE, 14), "11:15"), { allowOutsideRules: true })).rejects.toEqual(
      unavailable("time_off"),
    );
  });

  it("reschedule validates too, and ignores the appointment's own slot", async () => {
    const apt = await book(at(TUE, "15:00"));
    await expect(
      rescheduleAppointment(db, {
        clinicId: c.clinic.id,
        appointmentId: apt.id,
        newStartsAt: at(TUE, "03:00"),
      }),
    ).rejects.toEqual(unavailable("outside_hours"));
    await expect(
      rescheduleAppointment(db, {
        clinicId: c.clinic.id,
        appointmentId: apt.id,
        newStartsAt: at(TUE, "03:00"),
        source: "ai_call",
      }),
    ).rejects.toEqual(unavailable("outside_hours"));
    const moved = await rescheduleAppointment(db, {
      clinicId: c.clinic.id,
      appointmentId: apt.id,
      newStartsAt: at(TUE, "15:15"), // overlaps its own old slot
    });
    expect(moved.startsAt.getTime()).toBe(at(TUE, "15:15").getTime());
    const bypass = await rescheduleAppointment(db, {
      clinicId: c.clinic.id,
      appointmentId: apt.id,
      newStartsAt: at(TUE, "08:40"),
      allowOutsideRules: true,
    });
    expect(bypass.startsAt.getTime()).toBe(at(TUE, "08:40").getTime());
  });
});
