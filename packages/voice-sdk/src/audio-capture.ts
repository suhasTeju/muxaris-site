import { downsampleTo16k, floatToPcm16, FrameChunker } from "./pcm.js";
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
  let blobUrl: string | null = null;

  return {
    async start(onFrame) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      ctx = new AudioContext();
      const rate = ctx.sampleRate;
      const chunker = new FrameChunker();
      const handle = (f: Float32Array) => {
        const pcm = floatToPcm16(downsampleTo16k(f, rate));
        for (const frame of chunker.push(pcm)) onFrame(frame);
      };
      source = ctx.createMediaStreamSource(stream);
      sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);

      if (ctx.audioWorklet) {
        blobUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
        await ctx.audioWorklet.addModule(blobUrl);
        const worklet = new AudioWorkletNode(ctx, WORKLET_NAME);
        worklet.port.onmessage = (e: MessageEvent<Float32Array>) => handle(e.data);
        node = worklet;
      } else {
        const sp = ctx.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (e) => handle(new Float32Array(e.inputBuffer.getChannelData(0)));
        node = sp;
      }
      source.connect(node);
      node.connect(sink);
    },
    stop() {
      try {
        source?.disconnect();
        node?.disconnect();
        sink?.disconnect();
      } catch {
        // already disconnected
      }
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      stream = null;
      ctx = null;
      source = null;
      node = null;
      sink = null;
      blobUrl = null;
    },
  };
}
