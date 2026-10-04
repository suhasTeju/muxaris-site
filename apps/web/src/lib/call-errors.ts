export type CallErrorKind = "mic" | "auth_failed" | "busy" | "quota" | "provider" | "generic";

/** Error codes the voice SDK attaches to failures (`@muxaris/voice-sdk` errorCode). */
export type CallErrorCode = "auth" | "busy" | "quota" | "unsupported" | "network" | "internal";

const MIC_WORDING =
  /microphone|notallowed|permission|denied|notfound|requested device|getusermedia/;

/**
 * Prefers the SDK's `errorCode`; falls back to the gateway's wording (messages are defined in
 * apps/voice-gateway) and browser microphone failures when no code is present.
 */
export function classifyCallError(
  message: string | null | undefined,
  code?: string | null,
): CallErrorKind {
  const m = (message ?? "").toLowerCase();
  switch (code) {
    case "auth":
      return "auth_failed";
    case "busy":
      return "busy";
    case "quota":
      return "quota";
    case "internal":
      return "provider";
    case "network":
      return "generic";
    case "unsupported":
      return MIC_WORDING.test(m) ? "mic" : "generic";
  }
  if (MIC_WORDING.test(m)) return "mic";
  if (/provider|service unavailable|unavailable/.test(m)) return "provider";
  if (/concurrent|busy/.test(m)) return "busy";
  if (/quota|minutes|exhausted/.test(m)) return "quota";
  if (/token|expired|auth|start frame|invalid account|sign/.test(m)) return "auth_failed";
  return "generic";
}

export const CALL_ERROR_COPY: Record<CallErrorKind, { title: string; body: string }> = {
  mic: {
    title: "Microphone is blocked",
    body: "Allow microphone access for this site (look for the lock or camera icon in the address bar), then press Start call again.",
  },
  auth_failed: {
    title: "Your session expired",
    body: "Sign in again, then restart the call.",
  },
  busy: {
    title: "All call lines are busy",
    body: "Your clinic has reached its concurrent call limit. Wait for a call to finish and try again.",
  },
  quota: {
    title: "Monthly call minutes used up",
    body: "This month's included minutes are exhausted. Upgrade your plan to keep taking calls.",
  },
  provider: {
    title: "The voice service is having trouble",
    body: "This is on our side, not yours. Try again in a minute.",
  },
  generic: {
    title: "The call could not start",
    body: "Check your connection and try again.",
  },
};
