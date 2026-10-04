// packages/db/src/seed.ts
import { createDb } from "./client.js";
import { seedDemoClinic } from "./seed-data.js";
const url = process.env.DATABASE_URL ?? "postgres://muxaris:muxaris@localhost:5433/muxaris";
const { db, pool } = createDb(url);
const { clinicId } = await seedDemoClinic(db);
await pool.end();
console.log(`seeded demo clinic ${clinicId}`);
