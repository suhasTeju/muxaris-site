import { LANGUAGE_CODES, type LanguageCode, type NotificationKind } from "@muxaris/shared";

export interface TemplateVars {
  patientName: string | null;
  clinicName: string;
  doctorName: string;
  serviceName: string;
  /** Already formatted in the clinic's zone and the recipient's language (formatWhen). */
  when: string;
  clinicPhone: string | null;
}

interface LanguagePack {
  /** greeting(name) → first sentence, always ends with a full stop. */
  greeting: (name: string | null) => string;
  /** Line telling the patient how to change the booking. */
  change: (phone: string | null) => string;
  rebook: string;
  kinds: Record<NotificationKind, { subject: string; body: string }>;
}

// Placeholders: {clinic} {doctor} {service} {when}. Subjects never include the patient's name.
const PACKS: Record<LanguageCode, LanguagePack> = {
  "en-IN": {
    greeting: (n) => (n ? `Namaste ${n}.` : "Namaste."),
    change: (p) => (p ? `To change it, call ${p}.` : "To change it, call the clinic."),
    rebook: "Call the clinic to book again.",
    kinds: {
      appointment_confirmed: {
        subject: "Appointment confirmed at {clinic}",
        body: "Your {service} with {doctor} at {clinic} is booked for {when}.",
      },
      appointment_rescheduled: {
        subject: "Appointment moved: {clinic}",
        body: "Your {service} with {doctor} at {clinic} has been moved to {when}.",
      },
      appointment_cancelled: {
        subject: "Appointment cancelled: {clinic}",
        body: "Your {service} with {doctor} at {clinic} on {when} has been cancelled.",
      },
      reminder_24h: {
        subject: "Reminder: your appointment at {clinic}",
        body: "A reminder that your {service} with {doctor} at {clinic} is on {when}.",
      },
      reminder_2h: {
        subject: "Reminder: appointment today at {clinic}",
        body: "Your {service} with {doctor} at {clinic} is in about two hours, at {when}.",
      },
    },
  },
  "hi-IN": {
    greeting: (n) => (n ? `नमस्ते ${n}।` : "नमस्ते।"),
    change: (p) => (p ? `बदलाव के लिए ${p} पर कॉल करें।` : "बदलाव के लिए क्लिनिक को कॉल करें।"),
    rebook: "दोबारा बुक करने के लिए क्लिनिक को कॉल करें।",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} में अपॉइंटमेंट पक्की हुई",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट {when} के लिए बुक हो गई है।",
      },
      appointment_rescheduled: {
        subject: "{clinic}: अपॉइंटमेंट का समय बदला",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट अब {when} को है।",
      },
      appointment_cancelled: {
        subject: "{clinic}: अपॉइंटमेंट रद्द",
        body: "{clinic} में {doctor} के साथ {when} की आपकी {service} अपॉइंटमेंट रद्द कर दी गई है।",
      },
      reminder_24h: {
        subject: "याद दिलाना: {clinic} में अपॉइंटमेंट",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट {when} को है।",
      },
      reminder_2h: {
        subject: "याद दिलाना: आज {clinic} में अपॉइंटमेंट",
        body: "{clinic} में {doctor} के साथ आपकी {service} अपॉइंटमेंट लगभग दो घंटे में, {when} को है।",
      },
    },
  },
  "kn-IN": {
    greeting: (n) => (n ? `ನಮಸ್ಕಾರ ${n}.` : "ನಮಸ್ಕಾರ."),
    change: (p) => (p ? `ಬದಲಾವಣೆಗೆ ${p} ಗೆ ಕರೆ ಮಾಡಿ.` : "ಬದಲಾವಣೆಗೆ ಕ್ಲಿನಿಕ್‌ಗೆ ಕರೆ ಮಾಡಿ."),
    rebook: "ಮತ್ತೆ ಬುಕ್ ಮಾಡಲು ಕ್ಲಿನಿಕ್‌ಗೆ ಕರೆ ಮಾಡಿ.",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} ನಲ್ಲಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಖಚಿತವಾಗಿದೆ",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ {when} ಕ್ಕೆ ಬುಕ್ ಆಗಿದೆ.",
      },
      appointment_rescheduled: {
        subject: "{clinic}: ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಸಮಯ ಬದಲಾಗಿದೆ",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಈಗ {when} ಕ್ಕೆ ಇದೆ.",
      },
      appointment_cancelled: {
        subject: "{clinic}: ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದಾಗಿದೆ",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ {when} ರ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದಾಗಿದೆ.",
      },
      reminder_24h: {
        subject: "ಜ್ಞಾಪನೆ: {clinic} ನಲ್ಲಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ {when} ಕ್ಕೆ ಇದೆ.",
      },
      reminder_2h: {
        subject: "ಜ್ಞಾಪನೆ: ಇಂದು {clinic} ನಲ್ಲಿ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್",
        body: "{clinic} ನಲ್ಲಿ {doctor} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ {service} ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಸುಮಾರು ಎರಡು ಗಂಟೆಗಳಲ್ಲಿ, {when} ಕ್ಕೆ ಇದೆ.",
      },
    },
  },
  "ta-IN": {
    greeting: (n) => (n ? `வணக்கம் ${n}.` : "வணக்கம்."),
    change: (p) =>
      p ? `மாற்ற வேண்டுமெனில் ${p} ஐ அழைக்கவும்.` : "மாற்ற வேண்டுமெனில் கிளினிக்கை அழைக்கவும்.",
    rebook: "மீண்டும் பதிவு செய்ய கிளினிக்கை அழைக்கவும்.",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} இல் அப்பாயிண்ட்மெண்ட் உறுதி",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் {when} அன்று பதிவு செய்யப்பட்டுள்ளது.",
      },
      appointment_rescheduled: {
        subject: "{clinic}: அப்பாயிண்ட்மெண்ட் நேரம் மாற்றம்",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் இப்போது {when} அன்று உள்ளது.",
      },
      appointment_cancelled: {
        subject: "{clinic}: அப்பாயிண்ட்மெண்ட் ரத்து",
        body: "{clinic} இல் {doctor} உடன் {when} அன்று இருந்த உங்கள் {service} அப்பாயிண்ட்மெண்ட் ரத்து செய்யப்பட்டது.",
      },
      reminder_24h: {
        subject: "நினைவூட்டல்: {clinic} இல் அப்பாயிண்ட்மெண்ட்",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் {when} அன்று உள்ளது.",
      },
      reminder_2h: {
        subject: "நினைவூட்டல்: இன்று {clinic} இல் அப்பாயிண்ட்மெண்ட்",
        body: "{clinic} இல் {doctor} உடன் உங்கள் {service} அப்பாயிண்ட்மெண்ட் சுமார் இரண்டு மணி நேரத்தில், {when} அன்று உள்ளது.",
      },
    },
  },
  "te-IN": {
    greeting: (n) => (n ? `నమస్కారం ${n}.` : "నమస్కారం."),
    change: (p) => (p ? `మార్చాలంటే ${p} కి కాల్ చేయండి.` : "మార్చాలంటే క్లినిక్‌కు కాల్ చేయండి."),
    rebook: "మళ్లీ బుక్ చేయడానికి క్లినిక్‌కు కాల్ చేయండి.",
    kinds: {
      appointment_confirmed: {
        subject: "{clinic} లో అపాయింట్‌మెంట్ ఖరారు",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ {when} కి బుక్ అయింది.",
      },
      appointment_rescheduled: {
        subject: "{clinic}: అపాయింట్‌మెంట్ సమయం మారింది",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ ఇప్పుడు {when} కి ఉంది.",
      },
      appointment_cancelled: {
        subject: "{clinic}: అపాయింట్‌మెంట్ రద్దు",
        body: "{clinic} లో {doctor} తో {when} కి ఉన్న మీ {service} అపాయింట్‌మెంట్ రద్దు చేయబడింది.",
      },
      reminder_24h: {
        subject: "గుర్తు చేయడం: {clinic} లో అపాయింట్‌మెంట్",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ {when} కి ఉంది.",
      },
      reminder_2h: {
        subject: "గుర్తు చేయడం: ఈరోజు {clinic} లో అపాయింట్‌మెంట్",
        body: "{clinic} లో {doctor} తో మీ {service} అపాయింట్‌మెంట్ సుమారు రెండు గంటల్లో, {when} కి ఉంది.",
      },
    },
  },
};

function fill(s: string, v: TemplateVars): string {
  return s
    .replaceAll("{clinic}", v.clinicName)
    .replaceAll("{doctor}", v.doctorName)
    .replaceAll("{service}", v.serviceName)
    .replaceAll("{when}", v.when);
}

export function templateLanguage(code: string | null | undefined): LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(code ?? "")
    ? (code as LanguageCode)
    : "en-IN";
}

export function renderNotification(
  kind: NotificationKind,
  lang: LanguageCode,
  vars: TemplateVars,
): { subject: string; body: string } {
  const pack = PACKS[lang];
  const t = pack.kinds[kind];
  const tail = kind === "appointment_cancelled" ? pack.rebook : pack.change(vars.clinicPhone);
  return {
    subject: fill(t.subject, vars),
    body: `${pack.greeting(vars.patientName)} ${fill(t.body, vars)} ${tail}`,
  };
}

export function formatWhen(at: Date, tz: string, lang: LanguageCode): string {
  return new Intl.DateTimeFormat(lang, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(at);
}
