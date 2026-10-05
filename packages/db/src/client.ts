import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";
import { sslFromEnv } from "./ssl.js";
export type Db = NodePgDatabase<typeof schema>;
export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const ssl = sslFromEnv(process.env);
  const pool = new pg.Pool({ connectionString: url, max: 10, ...(ssl ? { ssl } : {}) });
  return { db: drizzle(pool, { schema }), pool };
}
