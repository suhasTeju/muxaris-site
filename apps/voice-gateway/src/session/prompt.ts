import type { getClinicContext } from "@muxaris/core";
import { LANGUAGES, type LanguageCode } from "@muxaris/shared";
import { WEEKDAY_NAMES, formatLocalLong } from "./local-time.js";

/** Spoken at the start of every call (privacy promise); `assistant.settings.disclosure === false` turns it off. */
export const DISCLOSURE: Record<LanguageCode, string> = {
  "en-IN": "This call is answered by an AI assistant and may be transcribed.",
  "hi-IN": "यह कॉल एक एआई सहायक द्वारा उत्तर दी जा रही है और इसे लिखित रूप में सहेजा जा सकता है।",
  "kn-IN": "ಈ ಕರೆಗೆ ಎಐ ಸಹಾಯಕ ಉತ್ತರಿಸುತ್ತಿದೆ ಮತ್ತು ಇದನ್ನು ಲಿಖಿತವಾಗಿ ದಾಖಲಿಸಬಹುದು.",
  "ta-IN":
    "இந்த அழைப்பிற்கு ஒரு AI உதவியாளர் பதிலளிக்கிறார்; இது எழுத்து வடிவில் பதிவு செய்யப்படலாம்.",
  "te-IN": "ఈ కాల్‌కు ఒక AI సహాయకుడు సమాధానం ఇస్తున్నారు; ఇది లిఖితంగా నమోదు కావచ్చు.",
};

export type ClinicContext = Awaited<ReturnType<typeof getClinicContext>>;

const languageLabel = (code: LanguageCode) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

/** Opening hours per weekday: the union of all active doctors' working hours, merged. */
export function openingHours(ctx: ClinicContext): string[] {
  const lines: string[] = [];
  for (const [i, name] of WEEKDAY_NAMES.entries()) {
    const spans = ctx.doctors
      .flatMap((d) => d.workingHours.filter((h) => h.weekday === i))
      .map((h) => [h.startTime, h.endTime] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const merged: Array<[string, string]> = [];
    for (const [s, e] of spans) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) {
        if (e > last[1]) last[1] = e;
      } else merged.push([s, e]);
    }
    lines.push(
      `${name}: ${merged.length ? merged.map(([s, e]) => `${s}-${e}`).join(", ") : "closed"}`,
    );
  }
  return lines;
}

export function buildSystemPrompt(
  ctx: ClinicContext,
  nowIso: string,
  language: LanguageCode,
): string {
  const { clinic, assistant } = ctx;
  const tz = clinic.timezone;
  const now = new Date(nowIso);
  const name = assistant?.name ?? "the receptionist";

  const doctors = ctx.doctors.map(
    (d) =>
      `- ${d.name}${d.title ? ` (${d.title})` : ""}, id=${d.id}, speaks ${d.languages.join("/")}` +
      (d.specialties.length ? `, ${d.specialties.join("/")}` : ""),
  );
  const services = ctx.services.map(
    (s) =>
      `- ${s.name}, id=${s.id}, ${s.durationMin} min` +
      (s.priceInr != null ? `, Rs ${s.priceInr}` : "") +
      (s.bookableByAi ? "" : " (cannot be booked by phone, offer a callback)"),
  );
  const faq = (assistant?.faq ?? []).map((f) => `Q: ${f.q}\nA: ${f.a}`);
  const holidays = ctx.holidays.map((h) => `${h.date}${h.name ? ` ${h.name}` : ""}`);

  const sections: string[] = [
    `You are ${name}, the phone receptionist for ${clinic.name}, a ${clinic.specialty} clinic in ${clinic.city}.` +
      (assistant?.tone ? ` Your tone is ${assistant.tone}.` : "") +
      " You have already greeted the caller; do not greet again.",
    `Current date and time: ${formatLocalLong(now, tz)} (${tz}). Use this to resolve "today", "tomorrow" and weekdays into YYYY-MM-DD dates.`,
    `Caller language: ${languageLabel(language)} (${language}). Reply in the caller's language, and switch if they switch.`,
  ];
  if (clinic.address)
    sections.push(`Address: ${clinic.address}${clinic.phone ? `. Phone: ${clinic.phone}` : ""}`);
  sections.push(`Doctors:\n${doctors.join("\n") || "- none listed"}`);
  sections.push(`Services:\n${services.join("\n") || "- none listed"}`);
  sections.push(`Opening hours:\n${openingHours(ctx).join("\n")}`);
  if (holidays.length) sections.push(`Holidays (closed): ${holidays.join("; ")}`);
  if (faq.length) sections.push(`FAQ:\n${faq.join("\n")}`);
  if (assistant?.knowledge) sections.push(`Clinic notes:\n${assistant.knowledge}`);

  sections.push(
    [
      "Rules:",
      "- Reply in the caller's language, in at most 2 short sentences. This is a phone call: no markdown, lists, emojis or symbols, and never speak your reasoning or any <thinking> text.",
      "- Never give medical advice or diagnoses. For emergencies, severe pain, bleeding, swelling or billing disputes, call transfer_to_staff.",
      "- Always call find_slots before offering any time, and only offer times it returned. Never invent availability.",
      "- Collect the caller's name and 10-digit mobile number before book_appointment, and confirm the exact day, time, doctor and service aloud before booking.",
      "- Tool results contain the only valid ids. Use real ids from the lists above, get_clinic_info or find_slots; never invent a service_id, doctor_id or appointment_id.",
      "- After a successful booking, say the exact time and that a confirmation will be sent. If book_appointment returns slot_unavailable, offer the alternatives it returned.",
      "- Before cancelling or rescheduling, ask for the mobile number used for the booking and use lookup_patient to find the appointment; never read out names.",
      "- Phone numbers are passed to tools as +91 followed by 10 digits.",
      "- If you do not understand, ask once to repeat; if still unclear, call transfer_to_staff with reason not_understood.",
      "- When the caller's needs are met, say a brief goodbye and call end_call.",
    ].join("\n"),
  );
  return sections.join("\n\n");
}
