import { eq } from "drizzle-orm";
import { schema, type Db } from "@muxaris/db";

/** Resolves a dialled E.164 number to its clinic and that clinic's first configured language. */
export async function findClinicByPhoneNumber(
  db: Db,
  e164: string,
): Promise<{ clinicId: string; language: string } | null> {
  const [row] = await db
    .select({ clinicId: schema.phoneNumbers.clinicId, languages: schema.clinics.languages })
    .from(schema.phoneNumbers)
    .innerJoin(schema.clinics, eq(schema.clinics.id, schema.phoneNumbers.clinicId))
    .where(eq(schema.phoneNumbers.e164, e164));
  if (!row) return null;
  return { clinicId: row.clinicId, language: (row.languages as string[])[0] ?? "en-IN" };
}
