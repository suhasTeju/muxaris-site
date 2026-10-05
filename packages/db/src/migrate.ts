import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";
import { applySecretsToEnv } from "./secrets.js";
await applySecretsToEnv();
const url = process.env.DATABASE_URL;
if (!url && process.env.NODE_ENV === "production")
  throw new Error("DATABASE_URL is required in production (set DB_SECRET_ARN or DATABASE_URL)");
const { db, pool } = createDb(url ?? "postgres://muxaris:muxaris@localhost:5433/muxaris");
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
await pool.end();
console.log("migrations applied");
