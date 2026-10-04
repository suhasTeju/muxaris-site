import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const envPath = resolve(import.meta.dirname, "../../.env");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, "");
}
export const SARVAM_KEY = process.env.SARVAM_TTS_API_KEY ?? "";
if (!SARVAM_KEY) {
  console.error("SARVAM_TTS_API_KEY missing in .env");
  process.exit(1);
}
export function fail(step: string, status: number | string, body: unknown): never {
  const b = typeof body === "string" ? body : JSON.stringify(body);
  console.error(`${step} failed: status=${status} body=${b.slice(0, 300)}`);
  process.exit(1);
}
