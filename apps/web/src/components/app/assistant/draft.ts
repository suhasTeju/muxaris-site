import {
  BULBUL_V3_SPEAKERS,
  LANGUAGES,
  assistantProfileBody,
  type AssistantProfile,
  type AssistantProfileBody,
  type BulbulV3Speaker,
  type LanguageCode,
} from "@muxaris/shared";
import { DEFAULT_SPEAKER } from "@/lib/onboarding";
import { formatPhone } from "../settings/format";

export const TONES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "warm", label: "Warm" },
  { id: "neutral", label: "Neutral" },
  { id: "formal", label: "Formal" },
];

export const VOICE_LABEL: Record<BulbulV3Speaker, string> = { shubh: "Shubh", priya: "Priya" };

/** "Generate from template" greetings, from the design (AppAssistant `TPL`). */
const TEMPLATES: Record<LanguageCode, (clinic: string) => string> = {
  "en-IN": (c) => `Hello, welcome to ${c}. How may I help you today?`,
  "hi-IN": (c) => `नमस्ते, ${c} में आपका स्वागत है। हम आपकी कैसे मदद कर सकते हैं?`,
  "kn-IN": (c) => `ನಮಸ್ಕಾರ, ${c}. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?`,
  "ta-IN": (c) => `வணக்கம், ${c}. நான் உங்களுக்கு எப்படி உதவலாம்?`,
  "te-IN": (c) => `నమస్కారం, ${c}. నేను మీకు ఎలా సహాయం చేయగలను?`,
};

export function templateGreeting(language: LanguageCode, clinicName: string): string {
  return TEMPLATES[language](clinicName.trim());
}

export const MAX_FAQ = 30;
export const MAX_GREETING = 300;

/** What the Assistant page edits; strings as typed, so a draft compares cleanly with its base. */
export interface AssistantDraft {
  name: string;
  tone: string;
  greeting: Partial<Record<LanguageCode, string>>;
  voices: Partial<Record<LanguageCode, BulbulV3Speaker>>;
  handoff: string;
  knowledge: string;
  faq: Array<{ q: string; a: string }>;
}

const isSpeaker = (v: unknown): v is BulbulV3Speaker =>
  (BULBUL_V3_SPEAKERS as readonly unknown[]).includes(v);

/** The clinic's languages in its own order (its first language is the default). */
export function clinicLanguages(codes: readonly string[]): LanguageCode[] {
  return codes.filter((c): c is LanguageCode => LANGUAGES.some((l) => l.code === c));
}

/** The editable draft for a saved profile (or the defaults when there is none yet). */
export function draftFrom(
  assistant: AssistantProfile | null,
  languages: LanguageCode[],
): AssistantDraft {
  return {
    name: assistant?.name ?? "Muxaris",
    tone: assistant?.tone ?? "warm",
    greeting: Object.fromEntries(languages.map((c) => [c, assistant?.greeting[c] ?? ""])),
    voices: Object.fromEntries(
      languages.map((c) => {
        const v = assistant?.voices[c];
        return [c, isSpeaker(v) ? v : DEFAULT_SPEAKER];
      }),
    ),
    handoff: formatPhone(assistant?.handoffNumber),
    knowledge: assistant?.knowledge ?? "",
    faq: (assistant?.faq ?? []).map((f) => ({ q: f.q, a: f.a })),
  };
}

export function sameDraft(a: AssistantDraft, b: AssistantDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type DraftErrors = Partial<
  Record<"name" | "handoff" | "knowledge" | "faq" | "form", string>
> & {
  greeting?: Partial<Record<LanguageCode, string>>;
};

/**
 * The PUT /v1/assistant body for a draft, or the field errors that stop it. Greetings and voices of
 * languages the clinic no longer offers are kept as stored.
 */
export function draftBody(
  draft: AssistantDraft,
  assistant: AssistantProfile | null,
  languages: LanguageCode[],
): { body: AssistantProfileBody; errors?: undefined } | { body?: undefined; errors: DraftErrors } {
  const pick = <T>(m: Partial<Record<LanguageCode, T>>) =>
    Object.fromEntries(languages.map((c) => [c, m[c]]));
  const body = {
    name: draft.name.trim(),
    tone: draft.tone,
    greeting: { ...(assistant?.greeting ?? {}), ...pick(draft.greeting) },
    voices: { ...(assistant?.voices ?? {}), ...pick(draft.voices) },
    handoffNumber: draft.handoff.trim() || null,
    faq: draft.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q || f.a),
    knowledge: draft.knowledge.trim() ? draft.knowledge : null,
  };
  const errors: DraftErrors = {};
  for (const c of languages) {
    const g = (draft.greeting[c] ?? "").trim();
    if (!g || g.length > MAX_GREETING)
      (errors.greeting ??= {})[c] = "Greeting needs 1 to 300 characters";
  }
  const parsed = assistantProfileBody.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (k === "name") errors.name = "Give the assistant a name (up to 60 characters)";
      else if (k === "handoffNumber") errors.handoff = "Enter a valid Indian phone number";
      else if (k === "knowledge") errors.knowledge = "Knowledge can be up to 8,000 characters";
      else if (k === "faq")
        errors.faq =
          "Each question and answer needs text (questions up to 200, answers up to 1000 characters)";
      else if (k === "greeting") {
        const c = issue.path[1] as LanguageCode;
        if (languages.includes(c))
          (errors.greeting ??= {})[c] = "Greeting needs 1 to 300 characters";
      }
    }
  }
  if (!parsed.success && !Object.keys(errors).length)
    errors.form = "Some values were not accepted. Check them and try again.";
  if (Object.keys(errors).length || !parsed.success) return { errors };
  return { body: parsed.data };
}
