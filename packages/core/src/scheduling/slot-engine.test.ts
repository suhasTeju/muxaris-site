import { TZDate } from "@date-fns/tz";
import { describe, expect, it } from "vitest";
import { findSlots, partOfDayOf, localDateString, type FindSlotsInput } from "./slot-engine.js";

const TZ = "Asia/Kolkata";
const ist = (s: string) => new Date(`${s}+05:30`); // "2026-10-06T10:00:00"
const base = (): FindSlotsInput => ({
  date: "2026-10-06", // Tuesday
  timezone: TZ,
  now: ist("2026-10-05T09:00:00"),
  rules: { slotGrainMin: 15, leadTimeMin: 60, maxDaysAhead: 30, allowSameDay: true, maxPerSlot: 1 },
  doctors: [
    {
      doctorId: "doc_a",
      workingHours: [{ weekday: 2, startTime: "10:00", endTime: "12:00" }],
      timeOff: [],
    },
  ],
  service: { serviceId: "svc", durationMin: 30, bufferMin: 10 },
  holidays: [],
  appointments: [],
});

describe("findSlots", () => {
  it("generates grid slots inside working hours that fit duration+buffer", () => {
    const slots = findSlots(base());
    // 10:00..12:00, need 40 min (30+10) → starts 10:00,10:15,10:30,10:45,11:00,11:15 (11:15+40=11:55 ok), 11:30 (12:10 no)
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(
      ["10:00", "10:15", "10:30", "10:45", "11:00", "11:15"].map((t) =>
        ist(`2026-10-06T${t}:00`).toISOString(),
      ),
    );
    expect(slots[0]!.endsAt.toISOString()).toBe(ist("2026-10-06T10:30:00").toISOString()); // endsAt excludes buffer
  });
  it("returns nothing on a day without working hours or on a holiday", () => {
    expect(findSlots({ ...base(), date: "2026-10-07" })).toEqual([]); // Wednesday, no hours
    expect(findSlots({ ...base(), holidays: ["2026-10-06"] })).toEqual([]);
  });
  it("excludes slots overlapping existing appointments including their buffer", () => {
    const slots = findSlots({
      ...base(),
      appointments: [
        {
          doctorId: "doc_a",
          startsAt: ist("2026-10-06T10:30:00"),
          endsAt: ist("2026-10-06T11:10:00"),
        },
      ],
    });
    const starts = slots.map((s) => s.startsAt.toISOString());
    // existing 10:30–11:00 plus its own 10 min buffer → busy 10:30–11:10 (caller passes endsAt already extended, see ExistingAppointment)
    // candidates (t, t+40): 10:00 ✗ 10:15 ✗ 10:30 ✗ 10:45 ✗ 11:00 ✗ (11:00 < 11:10) 11:15 ✓
    expect(starts).toEqual([ist("2026-10-06T11:15:00").toISOString()]);
  });
  it("excludes time off", () => {
    const slots = findSlots({
      ...base(),
      doctors: [
        {
          ...base().doctors[0]!,
          timeOff: [{ startsAt: ist("2026-10-06T10:00:00"), endsAt: ist("2026-10-06T11:00:00") }],
        },
      ],
    });
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(
      ["11:00", "11:15"].map((t) => ist(`2026-10-06T${t}:00`).toISOString()),
    );
  });
  it("respects lead time and same-day rule", () => {
    // now = 10:20 same day, lead 60 min → earliest 11:20; grid candidates ≥ 11:20 are 11:30 (11:30+40 > 12:00) → none
    const sameDay = { ...base(), now: ist("2026-10-06T10:20:00") };
    expect(findSlots(sameDay)).toEqual([]);
    // now = 09:00 same day → earliest 10:00 → full grid
    expect(findSlots({ ...sameDay, now: ist("2026-10-06T09:00:00") })).toHaveLength(6);
    expect(
      findSlots({
        ...sameDay,
        now: ist("2026-10-06T09:00:00"),
        rules: { ...sameDay.rules, allowSameDay: false },
      }),
    ).toEqual([]);
  });
  it("rejects dates beyond maxDaysAhead", () => {
    expect(findSlots({ ...base(), date: "2026-11-10" })).toEqual([]);
  });
  it("filters by part of day", () => {
    const d = {
      ...base(),
      doctors: [
        {
          doctorId: "doc_a",
          workingHours: [{ weekday: 2, startTime: "10:00", endTime: "20:00" }],
          timeOff: [],
        },
      ],
    };
    const afternoon = findSlots({ ...d, partOfDay: "afternoon" });
    expect(afternoon.every((s) => partOfDayOf(s.startsAt, TZ) === "afternoon")).toBe(true);
    expect(afternoon[0]!.startsAt.toISOString()).toBe(ist("2026-10-06T12:00:00").toISOString());
  });
  it("merges multiple doctors sorted by time then doctor", () => {
    const two = {
      ...base(),
      doctors: [
        base().doctors[0]!,
        {
          doctorId: "doc_b",
          workingHours: [{ weekday: 2, startTime: "10:00", endTime: "11:00" }],
          timeOff: [],
        },
      ],
    };
    const s = findSlots(two);
    expect(s.map((x) => `${x.startsAt.toISOString()}|${x.doctorId}`)).toEqual(
      [
        ["10:00", "doc_a"],
        ["10:00", "doc_b"],
        ["10:15", "doc_a"],
        ["10:15", "doc_b"],
        ["10:30", "doc_a"],
        ["10:45", "doc_a"],
        ["11:00", "doc_a"],
        ["11:15", "doc_a"],
      ].map(([t, d]) => `${ist(`2026-10-06T${t}:00`).toISOString()}|${d}`),
    );
  });
});
describe("time helpers", () => {
  it("localDateString and partOfDayOf use the clinic timezone", () => {
    expect(localDateString(ist("2026-10-06T00:30:00"), TZ)).toBe("2026-10-06");
    expect(partOfDayOf(ist("2026-10-06T11:59:00"), TZ)).toBe("morning");
    expect(partOfDayOf(ist("2026-10-06T16:59:00"), TZ)).toBe("afternoon");
    expect(partOfDayOf(ist("2026-10-06T17:00:00"), TZ)).toBe("evening");
  });
});

describe("findSlots hardening", () => {
  const nz = "Pacific/Auckland";
  const nzBase = (): FindSlotsInput => ({
    ...base(),
    timezone: nz,
    now: new Date(new TZDate(2026, 8, 26, 0, 0, 0, nz).getTime()),
    rules: { ...base().rules, maxDaysAhead: 0, leadTimeMin: 0 },
    doctors: [
      {
        doctorId: "doc_a",
        workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startTime: "10:00",
          endTime: "12:00",
        })),
        timeOff: [],
      },
    ],
  });
  it("computes day difference in the clinic timezone, independent of host TZ", () => {
    expect(findSlots({ ...nzBase(), date: "2026-09-26" }).length).toBeGreaterThan(0);
    expect(findSlots({ ...nzBase(), date: "2026-09-27" })).toEqual([]); // 1 day ahead across NZ DST start
  });
  it("accepts exactly maxDaysAhead and rejects one more", () => {
    const allDays = {
      ...base(),
      doctors: [
        {
          doctorId: "doc_a",
          workingHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            startTime: "10:00",
            endTime: "12:00",
          })),
          timeOff: [],
        },
      ],
    };
    expect(findSlots({ ...allDays, date: "2026-11-04" }).length).toBeGreaterThan(0); // now 10-05 + 30 days
    expect(findSlots({ ...allDays, date: "2026-11-05" })).toEqual([]);
  });
  it("treats an end time of 00:00 as next-day midnight", () => {
    const d = {
      ...base(),
      doctors: [
        {
          doctorId: "doc_a",
          workingHours: [{ weekday: 2, startTime: "22:00", endTime: "00:00" }],
          timeOff: [],
        },
      ],
    };
    const slots = findSlots(d);
    expect(slots[0]!.startsAt.toISOString()).toBe(ist("2026-10-06T22:00:00").toISOString());
    expect(slots.at(-1)!.startsAt.toISOString()).toBe(ist("2026-10-06T23:15:00").toISOString());
  });
  it("rejects malformed or non-real dates and holidays", () => {
    expect(() => findSlots({ ...base(), date: "2026-10-6" })).toThrow(RangeError);
    expect(() => findSlots({ ...base(), date: "2026-02-31" })).toThrow(RangeError);
    expect(() => findSlots({ ...base(), holidays: ["2026-10-6"] })).toThrow(RangeError);
  });
  it("rejects a non-positive slot grain", () => {
    expect(() => findSlots({ ...base(), rules: { ...base().rules, slotGrainMin: 0 } })).toThrow(
      RangeError,
    );
  });
  it("de-duplicates overlapping working-hours rows", () => {
    const d = {
      ...base(),
      doctors: [
        {
          doctorId: "doc_a",
          workingHours: [
            { weekday: 2, startTime: "10:00", endTime: "12:00" },
            { weekday: 2, startTime: "10:00", endTime: "11:00" },
          ],
          timeOff: [],
        },
      ],
    };
    expect(findSlots(d)).toHaveLength(6);
  });
  it("handles a DST-change day (America/New_York 2026-11-01)", () => {
    const ny = "America/New_York";
    const slots = findSlots({
      ...base(),
      date: "2026-11-01",
      timezone: ny,
      now: new Date("2026-10-30T12:00:00Z"),
      doctors: [
        {
          doctorId: "doc_a",
          workingHours: [{ weekday: 0, startTime: "09:00", endTime: "10:00" }],
          timeOff: [],
        },
      ],
    });
    // 09:00 EST (UTC-5) after the 02:00 fall-back
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-11-01T14:00:00.000Z",
      "2026-11-01T14:15:00.000Z",
    ]);
  });
  it("classifies 12:00 as afternoon", () => {
    expect(partOfDayOf(ist("2026-10-06T12:00:00"), TZ)).toBe("afternoon");
  });
});
