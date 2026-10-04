import type { BulbulV3Speaker, LanguageCode } from "@muxaris/shared";
import { CLINIC_COOKIE } from "./clinic";

export const STEPS = ["basics", "doctors", "services", "assistant", "review", "done"] as const;
export type OnboardingStep = (typeof STEPS)[number];

/** The five wizard screens (everything before "done"). */
export const WIZARD_STEPS = STEPS.slice(0, 5) as ReadonlyArray<OnboardingStep>;

export const STEP_LABELS: Record<OnboardingStep, string> = {
  basics: "Clinic",
  doctors: "Doctors",
  services: "Services",
  assistant: "Assistant",
  review: "Review",
  done: "Done",
};

export function isStep(v: unknown): v is OnboardingStep {
  return typeof v === "string" && (STEPS as readonly string[]).includes(v);
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = STEPS.indexOf(step);
  return STEPS[Math.min(i + 1, STEPS.length - 1)]!;
}

export function prevStep(step: OnboardingStep): OnboardingStep {
  const i = STEPS.indexOf(step);
  return STEPS[Math.max(i - 1, 0)]!;
}

/** Unknown or missing server values resume at the start. */
export function resumeStep(serverStep: unknown, hasClinic: boolean): OnboardingStep {
  if (!hasClinic) return "basics";
  return isStep(serverStep) ? serverStep : "basics";
}

export function writeActiveClinicCookie(id: string) {
  document.cookie = `${CLINIC_COOKIE}=${encodeURIComponent(id)}; Path=/; SameSite=Lax; max-age=31536000`;
}

// ---- Greetings ----

export const GREETING_TEMPLATES: Record<LanguageCode, string> = {
  "en-IN": "Hello, welcome to {clinic}. How may I help you today?",
  "hi-IN": "नमस्ते, {clinic} में आपका स्वागत है। बताइए, हम आपकी कैसे मदद कर सकते हैं?",
  "kn-IN": "ನಮಸ್ಕಾರ, {clinic} ಗೆ ಸ್ವಾಗತ. ನಾವು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?",
  "ta-IN": "வணக்கம், {clinic}-க்கு வரவேற்கிறோம். நாங்கள் உங்களுக்கு எப்படி உதவலாம்?",
  "te-IN": "నమస్కారం, {clinic} కి స్వాగతం. మేము మీకు ఎలా సహాయం చేయగలము?",
};

export function fillGreeting(language: LanguageCode, clinic: string): string {
  return GREETING_TEMPLATES[language].replaceAll("{clinic}", clinic.trim());
}

export const DEFAULT_SPEAKER: BulbulV3Speaker = "shubh";

// ---- Services ----

export interface ServiceDraft {
  name: string;
  durationMin: number;
  bufferMin: number;
  priceInr: number;
  bookableByAi: boolean;
}

export const DENTAL_SERVICE_DEFAULTS: ReadonlyArray<ServiceDraft> = [
  { name: "Consultation", durationMin: 20, bufferMin: 5, priceInr: 500, bookableByAi: true },
  { name: "Cleaning", durationMin: 30, bufferMin: 10, priceInr: 1500, bookableByAi: true },
  { name: "Filling", durationMin: 45, bufferMin: 10, priceInr: 2000, bookableByAi: true },
  { name: "Root canal", durationMin: 60, bufferMin: 15, priceInr: 6000, bookableByAi: false },
  { name: "Ortho consult", durationMin: 30, bufferMin: 5, priceInr: 800, bookableByAi: true },
  { name: "Whitening", durationMin: 60, bufferMin: 10, priceInr: 8000, bookableByAi: true },
];

// ---- Working hours ----

export interface DayHours {
  open: boolean;
  start: string;
  end: string;
}

/** Index 0 = Sunday ... 6 = Saturday, matching the API's weekday numbers. */
export type WeekHours = DayHours[];

/** Display order Monday first. */
export const DISPLAY_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function defaultWeekHours(): WeekHours {
  return Array.from({ length: 7 }, (_, d) => ({
    open: d !== 0,
    start: "10:00",
    end: "20:00",
  }));
}

export function copyMondayToAll(week: WeekHours): WeekHours {
  const monday = week[1]!;
  return week.map(() => ({ ...monday }));
}

/** Returns a message per weekday whose end is not after its start (open days only). */
export function validateWeekHours(week: WeekHours): Record<number, string> {
  const errors: Record<number, string> = {};
  week.forEach((d, i) => {
    if (!d.open) return;
    if (!/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.end)) {
      errors[i] = "Enter a start and end time";
    } else if (d.end <= d.start) {
      errors[i] = "End time must be after start time";
    }
  });
  return errors;
}

export function weekHoursPayload(week: WeekHours) {
  return week.flatMap((d, weekday) =>
    d.open ? [{ weekday, startTime: d.start, endTime: d.end }] : [],
  );
}
