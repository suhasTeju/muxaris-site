import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";
const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await pool.end();
console.log("migrations applied");
