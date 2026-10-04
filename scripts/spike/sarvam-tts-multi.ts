// Run: npx tsx scripts/spike/sarvam-tts-multi.ts
// Does one TTS WebSocket accept multiple text+flush cycles?
import WebSocket from "ws";
import { SARVAM_KEY, fail } from "./env.js";

const sentences = [
  "Hello, this is Sunrise Dental Care.",
  "Doctor Rao is available tomorrow at 4:30 PM.",
];
const t0 = performance.now();
const ws = new WebSocket(
  "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true",
  { headers: { "Api-Subscription-Key": SARVAM_KEY } },
);
const at = () => `+${Math.round(performance.now() - t0)} ms`;
let audio = 0;
let finals = 0;
let sent = 0;
const send = (o: unknown) => {
  console.log(`tts-multi -> [${at()}]`, JSON.stringify(o));
  ws.send(JSON.stringify(o));
};
const sendNext = () => {
  send({ type: "text", data: { text: sentences[sent]! } });
  send({ type: "flush" });
  sent++;
};
ws.on("open", () => {
  send({
    type: "config",
    data: {
      language_code: "en-IN",
      speaker: "shubh",
      speech_sample_rate: 24000,
      output_audio_codec: "linear16",
      min_buffer_size: 30,
      max_chunk_length: 150,
    },
  });
  sendNext();
});
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === "audio") {
    audio++;
    return;
  }
  console.log(`tts-multi <- [${at()}] (after ${audio} audio msgs)`, d.toString().slice(0, 300));
  if (m.type === "error") fail("tts-multi", "error-msg", d.toString());
  if (m.type === "event" && m.data?.event_type === "final") {
    finals++;
    if (sent < sentences.length) sendNext();
    else ws.close();
  }
});
ws.on("unexpected-response", (_r, resp) =>
  fail("tts-multi", resp.statusCode ?? "?", resp.statusMessage ?? ""),
);
ws.on("error", (e) => fail("tts-multi", "error", String(e)));
ws.on("close", (code, reason) => {
  console.log(
    `tts-multi closed ${code} ${reason.toString()}; audio-msgs=${audio} finals=${finals}`,
  );
  process.exit(finals === sentences.length ? 0 : 1);
});
setTimeout(() => fail("tts-multi", "timeout", `finals=${finals}`), 20000);
