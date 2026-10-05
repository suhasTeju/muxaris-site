import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId, schema } from "@muxaris/db";
import { eq } from "drizzle-orm";
import { findClinicByPhoneNumber } from "./phone-numbers.js";
import { dbReachable, makeTestClinic, openDb, warnIfUnreachable } from "./test-support.js";

const { db, pool } = openDb();
const reachable = await dbReachable();
warnIfUnreachable(reachable, "core phone-number tests");

(reachable ? describe : describe.skip)("findClinicByPhoneNumber", () => {
  let a: Awaited<ReturnType<typeof makeTestClinic>>;
  const e164 = `+1555${Math.floor(1000000 + Math.random() * 8999999)}`;
  beforeAll(async () => {
    a = await makeTestClinic(db, "pn-a");
    await db
      .insert(schema.phoneNumbers)
      .values({ id: newId("pn"), clinicId: a.clinic.id, e164, provider: "twilio" });
  });
  afterAll(async () => {
    await a?.cleanup();
    await pool.end();
  });

  it("maps a dialled number to its clinic and first language", async () => {
    const [row] = await db.select().from(schema.clinics).where(eq(schema.clinics.id, a.clinic.id));
    const hit = await findClinicByPhoneNumber(db, e164);
    expect(hit).toEqual({ clinicId: a.clinic.id, language: row!.languages[0] ?? "en-IN" });
  });

  it("returns null for an unknown number", async () => {
    expect(await findClinicByPhoneNumber(db, "+15550000000")).toBeNull();
  });
});
