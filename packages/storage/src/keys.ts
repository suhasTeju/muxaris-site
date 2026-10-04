// newId() = prefix + "_" + 16 lowercase alnum; the demo clinic is "cl_demo_sunrise".
const ID = /^[a-z]+_[0-9a-z_]{1,40}$/;

function assertId(id: string): string {
  if (!ID.test(id)) throw new Error("invalid id");
  return id;
}

export const callKeys = {
  recording: (clinicId: string, callId: string): string =>
    `clinics/${assertId(clinicId)}/calls/${assertId(callId)}/recording.wav`,
  transcript: (clinicId: string, callId: string): string =>
    `clinics/${assertId(clinicId)}/calls/${assertId(callId)}/transcript.json`,
};
