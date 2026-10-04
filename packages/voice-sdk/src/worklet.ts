// AudioWorklet processor source, inlined and loaded through a Blob URL so no bundler config is needed.
export const WORKLET_NAME = "muxaris-capture";

export const WORKLET_CODE = `
class MuxarisCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice());
    return true;
  }
}
registerProcessor("${WORKLET_NAME}", MuxarisCapture);
`;
