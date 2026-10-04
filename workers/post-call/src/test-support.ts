import pg from "pg";
import { createDb, schema, newId, type Db } from "@muxaris/db";
import { createClinicForUser } from "@muxaris/core";
import { eq } from "drizzle-orm";

export const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";

export async function dbReachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: TEST_DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function openDb(): { db: Db; pool: pg.Pool } {
  return createDb(TEST_DB_URL);
}

/** Creates a throwaway user + clinic. Call cleanup() in afterAll. */
export async function makeTestClinic(db: Db, label: string) {
  const tag = newId("usr").slice(4);
  const [user] = await db
    .insert(schema.users)
    .values({ id: newId("usr"), cognitoSub: `test-${tag}`, email: `${label}-${tag}@example.test` })
    .returning();
  const { clinic } = await createClinicForUser(db, {
    userId: user!.id,
    name: `Test ${label} ${tag}`,
    specialty: "dental",
    city: "Bengaluru",
  });
  return {
    user: user!,
    clinic,
    cleanup: async () => {
      await db.delete(schema.clinics).where(eq(schema.clinics.id, clinic.id));
      await db.delete(schema.users).where(eq(schema.users.id, user!.id));
    },
  };
}
