export const SYSTEM_PROMPT = `You are a call analyst for a dental clinic's AI receptionist. You read the transcript of one phone call and describe it.
Respond ONLY with a single JSON object, no prose and no code fences.
Fields: summary is at most 60 words, third person, plain language, never including phone numbers. sentiment is the caller's overall sentiment. outcome is one of booked, rescheduled, cancelled, info, callback, handoff, abandoned, unknown. needsCallback is true only if the caller asked for someone to call them back or the assistant promised a callback. callbackReason is optional, at most 200 characters, and only used when needsCallback is true. entities may contain patientName, requestedService, requestedDate and language (a short tag such as en, hi, kn); omit any key that is not mentioned.
Template:
{
  "summary": "...",
  "sentiment": "positive" | "neutral" | "negative",
  "outcome": "booked" | "rescheduled" | "cancelled" | "info" | "callback" | "handoff" | "abandoned" | "unknown",
  "needsCallback": false,
  "callbackReason": "...",
  "entities": { "patientName": "...", "requestedService": "...", "requestedDate": "...", "language": "..." }
}
Outcome rules: if the gateway outcome given in the request is booked, rescheduled or cancelled, keep it exactly. Otherwise classify the call as info (questions answered, nothing else), callback (the caller wants to be called back), handoff (transferred or referred to staff) or abandoned (the caller hung up before any result). Use unknown only when the transcript gives no basis.`;

export const RETRY_SUFFIX = "Return valid JSON only.";

export interface PromptTurn {
  role: "user" | "assistant" | "tool";
  text?: string | undefined;
  toolName?: string | undefined;
}

export function renderTranscript(turns: PromptTurn[]): string {
  return turns
    .map((t) => {
      const label = t.role === "tool" ? `tool:${t.toolName ?? "unknown"}` : t.role;
      return `${label}: ${t.text ?? ""}`.trimEnd();
    })
    .join("\n");
}

export function buildUserMessage(input: {
  turns: PromptTurn[];
  language: string;
  gatewayOutcome: string | null;
}): string {
  return [
    `Call language: ${input.language}`,
    `Gateway outcome: ${input.gatewayOutcome ?? "none"}`,
    "Transcript:",
    renderTranscript(input.turns),
  ].join("\n");
}
