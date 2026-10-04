import { writeFileSync } from "node:fs";
import { SarvamTts } from "../sarvam-tts.js";

const apiKey = process.env["SARVAM_TTS_API_KEY"];
if (!apiKey) throw new Error("SARVAM_TTS_API_KEY required");
const t0 = Date.now();
const pcm = await new SarvamTts({ apiKey }).preview("Namaskara. How can I help you today?", {
  language: "en-IN",
  speaker: "shubh",
});
console.log(`bytes=${pcm.length} ms=${Date.now() - t0}`);
writeFileSync("tts-manual.pcm", pcm); // ffplay -f s16le -ar 24000 -ac 1 tts-manual.pcm
