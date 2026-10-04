export const SYSTEM_PROMPT = `You are a call analyst for a dental clinic's AI receptionist. You read the transcript of one phone call and describe it.
Respond ONLY with a single JSON object, no prose and no code fences, with exactly these keys:
{
  "summary": string,            // at most 60 words, third person, plain language, never include phone numbers
  "sentiment": "positive" | "neutral" | "negative",   // the caller's overall sentiment
  "outcome": "booked" | "rescheduled" | "cancelled" | "info" | "callback" | "handoff" | "abandoned" | "unknown",
  "needsCallback": boolean,     // true only if the caller asked for someone to call them back or the assistant promised a callback
  "callbackReason": string,     // optional, at most 200 characters, only when needsCallback is true
  "entities": {                 // omit any key that is not mentioned
    "patientName": string,
    "requestedService": string,
    "requestedDate": string,
    "language": string          // short language tag such as "en", "hi", "kn"
  }
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
