import { floatToPcm16, FrameChunker, Resampler } from "./pcm.js";
import { WORKLET_CODE, WORKLET_NAME } from "./worklet.js";

export interface MicCapture {
  /** Starts the microphone; `onFrame` receives 3200-byte PCM16 16 kHz frames. */
  start(onFrame: (frame: ArrayBuffer) => void): Promise<void>;
  stop(): void;
}

export function createMicCapture(): MicCapture {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: AudioNode | null = null;
  let sink: GainNode | null = null;
  let stopped = false;

  const release = () => {
    try {
      source?.disconnect();
      node?.disconnect();
      sink?.disconnect();
    } catch {
      // already disconnected
    }
    stream?.getTracks().forEach((t) => t.stop());
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
    stream = null;
    ctx = null;
    source = null;
    node = null;
    sink = null;
  };

  const run = async (onFrame: (frame: ArrayBuffer) => void) => {
    const media = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    if (stopped) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = media;
    const c = new AudioContext();
    ctx = c;
    const resampler = new Resampler(c.sampleRate);
    await Promise.resolve(c.resume()).catch(() => undefined);
    if (stopped) return release();

    const chunker = new FrameChunker();
    const handle = (f: Float32Array) => {
      for (const frame of chunker.push(floatToPcm16(resampler.push(f)))) onFrame(frame);
    };
    source = c.createMediaStreamSource(media);
    sink = c.createGain();
    sink.gain.value = 0;
    sink.connect(c.destination);

    let worklet: AudioWorkletNode | null = null;
    if (c.audioWorklet) {
      const blobUrl = URL.createObjectURL(
        new Blob([WORKLET_CODE], { type: "application/javascript" }),
      );
      try {
        await c.audioWorklet.addModule(blobUrl);
        if (stopped) return release();
        worklet = new AudioWorkletNode(c, WORKLET_NAME);
        worklet.port.onmessage = (e: MessageEvent<Float32Array>) => handle(e.data);
        node = worklet;
      } catch {
        // e.g. CSP blocks blob: worklets; fall back to ScriptProcessor
        if (stopped) return release();
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    if (!node) {
      const sp = c.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => handle(new Float32Array(e.inputBuffer.getChannelData(0)));
      node = sp;
    }
    source.connect(node);
    node.connect(sink);
  };

  return {
    async start(onFrame) {
      stopped = false;
      try {
        await run(onFrame);
      } catch (e) {
        release();
        throw e;
      }
    },
    stop() {
      stopped = true;
      release();
    },
  };
}
