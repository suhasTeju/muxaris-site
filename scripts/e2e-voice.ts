/* eslint-disable @typescript-eslint/no-explicit-any -- manual smoke script; API/gateway JSON is inspected loosely on purpose */
/**
 * End-to-end voice smoke test against the real providers (Sarvam STT/TTS, Bedrock Nova).
 * Synthetic input only. Run through scripts/e2e-voice.sh (starts a second api + gateway).
 *
 *   E2E_API_URL (http://localhost:4001)  E2E_WS_URL (ws://localhost:4101)
 *   E2E_LANGUAGE (en-IN)  E2E_UTTERANCE  E2E_OUT_DIR (<tmp>/muxaris-e2e)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { SarvamTts } from "../apps/voice-gateway/src/providers/sarvam-tts.ts";

const API = process.env["E2E_API_URL"] ?? "http://localhost:4001";
const WS_URL = process.env["E2E_WS_URL"] ?? "ws://localhost:4101";
const LANGUAGE = (process.env["E2E_LANGUAGE"] ?? "en-IN") as "en-IN";
const UTTERANCE = process.env["E2E_UTTERANCE"] ?? "I want a teeth cleaning tomorrow afternoon";
const OUT = process.env["E2E_OUT_DIR"] ?? join(tmpdir(), "muxaris-e2e");
const MAX_TURNS = 6;
const FRAME_BYTES = 3200; // 100 ms of PCM16 mono 16 kHz
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const logLines: string[] = [];
const mask = (s: string): string =>
  s.replace(/\+?\d[\d\s().-]{6,}\d/g, (m) =>
    m.replace(/\D/g, "").length >= 7 && !/^\d{4}-\d{2}-\d{2}$/.test(m) ? "[phone]" : m,
  );
function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${mask(msg)}`;
  logLines.push(line);
  console.log(line);
}
function flush(): void {
  writeFileSync(join(OUT, "e2e-events.log"), logLines.join("\n") + "\n");
}
function fail(msg: string): never {
  log(`FAIL: ${msg}`);
  flush();
  process.exit(1);
}

const apiKey = process.env["SARVAM_TTS_API_KEY"];
if (!apiKey) fail("SARVAM_TTS_API_KEY not set");

// 24 kHz PCM16 -> 16 kHz PCM16 by linear interpolation.
function resample24to16(pcm: Buffer): Buffer {
  const n = Math.floor(pcm.length / 2);
  const outN = Math.floor((n * 2) / 3);
  const out = Buffer.alloc(outN * 2);
  for (let i = 0; i < outN; i++) {
    const pos = i * 1.5;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, n - 1);
    const f = pos - i0;
    const s = pcm.readInt16LE(i0 * 2) * (1 - f) + pcm.readInt16LE(i1 * 2) * f;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s))), i * 2);
  }
  return out;
}

const tts = new SarvamTts({ apiKey: apiKey! });
async function synth(text: string): Promise<Buffer> {
  const pcm24 = await tts.preview(text, { language: LANGUAGE, speaker: "shubh" });
  if (pcm24.length < 4800) fail(`TTS returned too little audio for "${text}"`);
  return resample24to16(pcm24);
}

async function api(path: string, token: string, init: RequestInit = {}, clinicId?: string) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(clinicId ? { "X-Clinic-Id": clinicId } : {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-json */
  }
  if (!res.ok) fail(`${init.method ?? "GET"} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return body;
}

function wav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function replyFor(assistant: string, turn: number): { text: string; label: string } {
  const t = assistant.toLowerCase();
  if (/(phone|mobile|number|contact)/.test(t) && /name/.test(t))
    return {
      text: "My name is Test Patient and my phone number is 9 8 7 6 5, 4 3 2 1 0.",
      label: "name+phone",
    };
  if (/(phone|mobile|number|contact)/.test(t))
    return { text: "My phone number is 9 8 7 6 5, 4 3 2 1 0.", label: "phone" };
  if (/name/.test(t)) return { text: "My name is Test Patient.", label: "name" };
  if (/(confirm|shall i|should i|would you like me|is that|correct|go ahead|book it)/.test(t))
    return { text: "Yes, please confirm.", label: "yes" };
  if (/(slot|time|which|afternoon|available|prefer|option|doctor)/.test(t))
    return { text: "The first one works for me.", label: "slot" };
  return { text: turn === 0 ? "Yes, please." : "Yes.", label: "yes-default" };
}

async function main(): Promise<void> {
  // (a)-(c) auth, clinic, demo data
  const sub = `e2e-${Date.now()}`;
  const token = `dev:${sub}:${sub}@example.com`;
  const me = await api("/v1/me", token);
  log(
    `/v1/me ok user=${me.user?.id ? "present" : "missing"} memberships=${me.memberships?.length}`,
  );
  const created = await api("/v1/clinics", token, {
    method: "POST",
    body: JSON.stringify({ name: `E2E Clinic ${sub}`, city: "Bengaluru" }),
  });
  const clinicId: string = created.clinic.id;
  await api("/v1/demo/load", token, { method: "POST" }, clinicId);
  log(`clinic ${clinicId} created, demo data loaded`);

  // (d) synthesise
  const t0 = Date.now();
  const first = await synth(UTTERANCE);
  log(`synthesised utterance (${(first.length / 32000).toFixed(1)}s audio, ${Date.now() - t0} ms)`);

  // (e) connect
  const ws = new WebSocket(`${WS_URL}/v1/session`);
  const received: Buffer[] = [];
  let audioBytes = 0;
  let lastAudioAt = 0;
  let firstAudioAfterMark = 0;
  let markAt = 0;
  let assistantCount = 0;
  let lastAssistant = "";
  let bookingId = "";
  let ended = false;
  let errorEv = "";
  let ready = false;
  let callId = "";
  const toolSeen: string[] = [];
  const assistantTurns: string[] = [];

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      const b = data as Buffer;
      received.push(b);
      audioBytes += b.length;
      lastAudioAt = Date.now();
      if (markAt && !firstAudioAfterMark) firstAudioAfterMark = Date.now();
      return;
    }
    let ev: any;
    try {
      ev = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (ev.type) {
      case "ready":
        ready = true;
        callId = String(ev.callId ?? "");
        log(`ready assistant=${ev.assistantName} lang=${ev.language} greeting="${ev.greeting}"`);
        break;
      case "state":
        log(`state ${ev.state}`);
        break;
      case "transcript":
        log(`transcript ${ev.role}: ${ev.text}`);
        if (ev.role === "assistant") {
          assistantCount++;
          lastAssistant = ev.text;
          assistantTurns.push(ev.text);
        }
        break;
      case "tool":
        toolSeen.push(`${ev.name}:${ev.status}`);
        log(`tool ${ev.name} ${ev.status} ${ev.summary}`);
        break;
      case "booking":
        bookingId = ev.appointmentId;
        log(
          `booking id=${ev.appointmentId} doctor=${ev.doctorName} service=${ev.serviceName} at=${ev.startsAt}`,
        );
        break;
      case "ended":
        ended = true;
        log(`ended reason=${ev.reason} outcome=${ev.outcome ?? ""}`);
        break;
      case "error":
        errorEv = `${ev.code}: ${ev.message}`;
        log(`error ${errorEv}`);
        break;
      case "flush_playback":
      case "usage":
        log(ev.type + (ev.type === "usage" ? ` used=${ev.secondsUsed}` : ""));
        break;
      default:
        log(`event ${JSON.stringify(ev).slice(0, 120)}`);
    }
  });
  ws.on("close", (code) => {
    ended = true;
    log(`socket closed code=${code}`);
  });
  await new Promise<void>((res, rej) => {
    ws.once("open", () => res());
    ws.once("error", (e) => rej(e));
  }).catch((e) => fail(`ws connect: ${(e as Error).message}`));
  ws.send(JSON.stringify({ type: "start", token, clinicId, language: LANGUAGE }));

  const until = async (cond: () => boolean, ms: number, what: string): Promise<void> => {
    const end = Date.now() + ms;
    while (!cond()) {
      if (errorEv) fail(`gateway error while waiting for ${what}: ${errorEv}`);
      if (ended && !cond()) fail(`session ended while waiting for ${what}`);
      if (Date.now() > end) fail(`timeout waiting for ${what}`);
      await sleep(50);
    }
  };
  // Wait until playback has been quiet for quietMs (and at least minBytes since startBytes).
  const settle = async (startBytes: number, minBytes: number, quietMs: number, maxMs: number) => {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      if (errorEv) fail(`gateway error: ${errorEv}`);
      const got = audioBytes - startBytes;
      if (got >= minBytes && Date.now() - lastAudioAt > quietMs) return;
      await sleep(50);
    }
  };

  await until(() => ready, 15000, "ready");
  // 24 kHz PCM16 => 48000 bytes/s; >= ~2 s of greeting audio, then quiet.
  await settle(0, 96000, 1200, 20000);
  log(`greeting audio received: ${(audioBytes / 48000).toFixed(1)}s`);

  const latencies: number[] = [];
  const stream = async (pcm: Buffer): Promise<void> => {
    const silence = Buffer.alloc(16000 * 2 * 1.5); // 1.5 s
    for (let o = 0; o < pcm.length; o += FRAME_BYTES) {
      const frame = Buffer.alloc(FRAME_BYTES);
      pcm.copy(frame, 0, o, Math.min(o + FRAME_BYTES, pcm.length));
      ws.send(frame);
      await sleep(100);
    }
    markAt = Date.now();
    firstAudioAfterMark = 0;
    for (let o = 0; o < silence.length; o += FRAME_BYTES) {
      ws.send(silence.subarray(o, o + FRAME_BYTES));
      await sleep(100);
    }
  };

  let pcm = first;
  let label = "initial request";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    log(`--- user turn ${turn + 1} (${label}) ---`);
    const before = assistantCount;
    const bytesBefore = audioBytes;
    await stream(pcm);
    await until(() => assistantCount > before, 45000, "assistant reply");
    if (firstAudioAfterMark) {
      const ms = firstAudioAfterMark - markAt;
      latencies.push(ms);
      log(`latency speech-end -> first reply audio: ${ms} ms`);
    } else {
      // transcript may precede audio; wait briefly for first audio
      await until(() => firstAudioAfterMark > 0, 15000, "reply audio").catch(() => {});
      if (firstAudioAfterMark) {
        const ms = firstAudioAfterMark - markAt;
        latencies.push(ms);
        log(`latency speech-end -> first reply audio: ${ms} ms`);
      }
    }
    // let the reply finish playing
    await sleep(500);
    await settle(bytesBefore, 1, 1500, 20000);
    markAt = 0;
    if (bookingId || ended) break;
    const r = replyFor(lastAssistant, turn);
    label = r.label;
    pcm = await synth(r.text);
  }

  // let any trailing booking event land
  await sleep(1500);
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end" }));
  const endBy = Date.now() + 15000;
  while (!ended && Date.now() < endBy) await sleep(100);
  if (ws.readyState === WebSocket.OPEN) ws.close();

  const all = Buffer.concat(received);
  writeFileSync(join(OUT, "e2e-reply.wav"), wav(all, 24000));
  log(`saved reply audio (${(all.length / 48000).toFixed(1)}s) to ${join(OUT, "e2e-reply.wav")}`);

  // (h) recording: the gateway uploads the WAV + transcript after the call ends (<= 20 s)
  if (!callId) fail("no callId received in ready event");
  const readyBy = Date.now() + 20_000;
  const recStart = Date.now();
  let rec: any = null;
  for (;;) {
    rec = (await api(`/v1/calls/${callId}`, token, {}, clinicId)).call;
    if (rec.recordingStatus === "ready" || rec.recordingStatus === "failed") break;
    if (Date.now() > readyBy) break;
    await sleep(500);
  }
  if (rec.recordingStatus !== "ready")
    fail(`recording not ready within 20s (status=${rec.recordingStatus})`);
  if (!rec.transcriptS3Key) fail("transcriptS3Key not set");
  if (!rec.recordingS3Key) fail("recordingS3Key not set");
  log(`recording ready in ${Date.now() - recStart} ms`);

  // (h1) presigned playback. The URL is signed for GET, so a HEAD is rejected (403): fetch one
  // byte with a Range request and read the total size from content-range. URL is never logged.
  const { url: recUrl } = await api(`/v1/calls/${callId}/recording-url`, token, {}, clinicId);
  const head = await fetch(recUrl as string, { headers: { Range: "bytes=0-0" } });
  if (!head.ok) fail(`recording fetch failed with status ${head.status}`);
  await head.arrayBuffer();
  const wavBytes = Number(
    head.headers.get("content-range")?.split("/")[1] ?? head.headers.get("content-length") ?? 0,
  );
  const wavType = head.headers.get("content-type") ?? "";
  if (!(wavBytes > 44)) fail(`recording too small: ${wavBytes} bytes`);
  if (!wavType.startsWith("audio/wav")) fail(`unexpected recording content-type: ${wavType}`);
  log(`presigned recording OK: ${wavBytes} bytes, ${wavType}`);

  // (h2) post-call analysis (needs the worker; E2E_WITH_WORKER=1 in e2e-voice.sh)
  if (process.env["E2E_EXPECT_SUMMARY"] === "1") {
    const analysedBy = Date.now() + 60_000;
    const anStart = Date.now();
    let an: any = null;
    for (;;) {
      an = (await api(`/v1/calls/${callId}`, token, {}, clinicId)).call;
      if (an.analysedAt || Date.now() > analysedBy) break;
      await sleep(3000);
    }
    if (!an.analysedAt || !an.summary)
      fail("call not analysed within 60s (is the worker running?)");
    const words = String(an.summary).trim().split(/\s+/).length;
    log(`analysed ${Date.now() - anStart} ms after recording ready, summary words=${words}`);
  }

  // (i) appointment check
  const from = new Date(Date.now() - 3600_000).toISOString();
  const to = new Date(Date.now() + 4 * 86400_000).toISOString();
  const appts = await api(
    `/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    token,
    {},
    clinicId,
  );
  const ai = (appts.appointments as any[]).filter((a) => a.source === "ai_call");
  const match = bookingId ? ai.find((a) => a.id === bookingId) : ai[0];
  log(`appointments in window: ${appts.appointments.length}, ai_call: ${ai.length}`);
  if (match)
    log(`appointment FOUND id=${match.id} status=${match.status} startsAt=${match.startsAt}`);
  log(`assistant turns: ${assistantTurns.length}; tools: ${toolSeen.join(", ") || "none"}`);
  if (latencies.length) log(`latencies ms: ${latencies.join(", ")}`);
  const ok = Boolean(match);
  log(ok ? "PASS" : "FAIL: no ai_call appointment found");
  flush();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => fail(`unexpected: ${(e as Error).message}`));
