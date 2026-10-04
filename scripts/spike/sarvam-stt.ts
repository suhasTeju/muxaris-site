// Run: npx tsx scripts/spike/sarvam-stt.ts [path/to/16k-mono.pcm]
// Prep: ffmpeg -y -i scripts/spike/out/tts-rest.wav -ar 16000 -ac 1 -f s16le scripts/spike/out/in16k.pcm
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { SARVAM_KEY, fail } from "./env.js";

const pcmPath = process.argv[2] ?? new URL("./out/in16k.pcm", import.meta.url).pathname;
const pcm = readFileSync(pcmPath);
const mode = process.env.STT_MODE ?? "codemix";
const qs = `model=saaras:v4&language-code=unknown${mode ? `&mode=${mode}` : ""}&sample_rate=16000&input_audio_codec=pcm_s16le&vad_signals=true`;
const url = `wss://api.sarvam.ai/speech-to-text/ws?${qs}`;
const ws = new WebSocket(url, { headers: { "Api-Subscription-Key": SARVAM_KEY } });
const t0 = performance.now();
let sendEnd = 0;
let firstTranscript = 0;
ws.on("open", async () => {
  console.log(`stt ws open in ${Math.round(performance.now() - t0)} ms (${qs})`);
  const frame = 16000 * 2 * 0.1; // 100 ms of 16 kHz PCM16
  for (let i = 0; i < pcm.length; i += frame) {
    ws.send(
      JSON.stringify({
        audio: {
          data: pcm.subarray(i, i + frame).toString("base64"),
          sample_rate: "16000",
          encoding: "audio/wav",
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 100)); // real-time pacing
  }
  sendEnd = performance.now();
  console.log(`stt audio sent (${Math.round(sendEnd - t0)} ms since start); sending flush`);
  ws.send(JSON.stringify({ type: "flush" }));
  setTimeout(() => ws.close(), 4000);
});
ws.on("message", (d) => {
  const s = d.toString();
  const at = Math.round(performance.now() - t0);
  try {
    if (JSON.parse(s).type === "data" && !firstTranscript) firstTranscript = at;
  } catch {
    /* non-JSON */
  }
  console.log(`stt <- [+${at} ms]`, s.slice(0, 600));
});
ws.on("unexpected-response", (_r, resp) =>
  fail("stt-ws", resp.statusCode ?? "?", resp.statusMessage ?? ""),
);
ws.on("error", (e) => fail("stt-ws", "error", String(e)));
ws.on("close", (code, reason) => {
  console.log(
    `stt ws closed ${code} ${reason.toString()}; first-transcript=${firstTranscript} ms since open-start (${firstTranscript && sendEnd ? Math.round(firstTranscript - (sendEnd - t0)) : "?"} ms after last audio)`,
  );
  if (!firstTranscript) fail("stt-ws", code, "no data transcript received");
  process.exit(0);
});
