import { readFileSync } from "node:fs";
import { SarvamStt } from "../sarvam-stt.js";

// usage: tsx stt.ts file.pcm   (PCM16 mono 16 kHz)
const apiKey = process.env["SARVAM_TTS_API_KEY"];
const file = process.argv[2];
if (!apiKey || !file) throw new Error("SARVAM_TTS_API_KEY and a 16 kHz PCM16 file are required");
const stream = await new SarvamStt({ apiKey }).open();
stream.on("speech_start", () => console.log("speech_start"));
stream.on("speech_end", () => console.log("speech_end"));
stream.on("transcript", (t) => {
  console.log("transcript", t);
  stream.close();
});
stream.on("error", (e) => console.error("error", e));
const pcm = readFileSync(file);
for (let i = 0; i < pcm.length; i += 3200) {
  stream.sendAudio(pcm.subarray(i, i + 3200));
  await new Promise((r) => setTimeout(r, 100));
}
stream.end();
