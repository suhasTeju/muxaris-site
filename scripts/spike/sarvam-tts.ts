// Run: npx tsx scripts/spike/sarvam-tts.ts
import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
import { SARVAM_KEY, fail } from "./env.js";

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const text = "Namaskara. Doctor Rao is available tomorrow at 4:30 PM. Should I book it?";

// 1) REST
const t0 = performance.now();
const res = await fetch("https://api.sarvam.ai/text-to-speech", {
  method: "POST",
  headers: { "api-subscription-key": SARVAM_KEY, "content-type": "application/json" },
  body: JSON.stringify({
    text,
    target_language_code: "en-IN",
    speaker: "shubh",
    model: "bulbul:v3",
    pace: 1.0,
    speech_sample_rate: 24000,
  }),
});
if (!res.ok) fail("tts-rest", res.status, await res.text());
const json = (await res.json()) as { audios: string[] } & Record<string, unknown>;
const wav = Buffer.from(json.audios[0]!, "base64");
writeFileSync(new URL("./out/tts-rest.wav", import.meta.url), wav);
console.log(
  `tts-rest ok: ${wav.length} bytes in ${Math.round(performance.now() - t0)} ms -> scripts/spike/out/tts-rest.wav`,
);
console.log(
  "tts-rest response keys:",
  Object.keys(json).join(","),
  "header:",
  wav.subarray(0, 4).toString(),
);

// 2) WebSocket streaming: wss://api.sarvam.ai/text-to-speech/ws (from sarvamai SDK)
const wsUrl = "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true";
const w0 = performance.now();
const ws = new WebSocket(wsUrl, [`api-subscription-key.${SARVAM_KEY}`], {
  headers: { "Api-Subscription-Key": SARVAM_KEY },
});
const chunks: Buffer[] = [];
let firstAudio = 0;
let n = 0;
ws.on("open", () => {
  console.log(`tts-ws open in ${Math.round(performance.now() - w0)} ms`);
  const send = (o: unknown) => {
    console.log("tts-ws ->", JSON.stringify(o).slice(0, 300));
    ws.send(JSON.stringify(o));
  };
  send({
    type: "config",
    data: {
      language_code: "en-IN",
      speaker: "shubh",
      pace: 1.0,
      speech_sample_rate: 24000,
      output_audio_codec: process.env.TTS_CODEC ?? "wav",
      min_buffer_size: 30,
      max_chunk_length: 150,
    },
  });
  send({ type: "text", data: { text } });
  send({ type: "flush" });
});
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === "audio") {
    if (!firstAudio && m.data.audio.length > 100) firstAudio = performance.now() - w0;
    chunks.push(Buffer.from(m.data.audio, "base64"));
    n++;
    const redacted = { ...m, data: { ...m.data, audio: `<${m.data.audio.length} b64 chars>` } };
    console.log("tts-ws <-", JSON.stringify(redacted));
  } else {
    console.log("tts-ws <-", d.toString().slice(0, 400));
    if (m.type === "event" && m.data?.event_type === "final") ws.close();
    if (m.type === "error") fail("tts-ws", "error-msg", d.toString());
  }
});
ws.on("unexpected-response", (_r, resp) =>
  fail("tts-ws", resp.statusCode ?? "?", resp.statusMessage ?? ""),
);
ws.on("error", (e) => fail("tts-ws", "error", String(e)));
ws.on("close", (code, reason) => {
  writeFileSync(new URL("./out/tts-ws.audio", import.meta.url), Buffer.concat(chunks));
  console.log(
    `tts-ws closed ${code} ${reason.toString()}; chunks=${n} first-audio=${Math.round(firstAudio)} ms total=${Math.round(performance.now() - w0)} ms`,
  );
  process.exit(0);
});
setTimeout(() => fail("tts-ws", "timeout", "no completion in 20s"), 20000);
