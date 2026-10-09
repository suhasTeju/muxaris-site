import { LANGUAGE_CODES, type LanguageCode, type NotificationKind } from "@muxaris/shared";

export interface TemplateVars {
  patientName: string | null;
  clinicName: string;
  doctorName: string;
  serviceName: string;
  /** Already formatted in the clinic's zone and the recipient's language (formatWhen). */
  when: string;
  /** E.164; the message prints it grouped ("+91 80 4123 4567"). */
  clinicPhone: string | null;
  /** The appointment's start, for the HTML email's date card (left out without it). */
  startsAt?: Date;
  /** IANA zone the date card is read in (default Asia/Kolkata). */
  timezone?: string;
  /** Printed on the date card and in the footer of the HTML email. */
  clinicAddress?: string | null;
  /** With the locality from the address, the HTML email's header line ("JAYANAGAR · BENGALURU"). */
  clinicCity?: string | null;
}

interface LanguagePack {
  /** greeting(name) → first sentence, always ends with a full stop. */
  greeting: (name: string | null) => string;
  /** Line telling the patient how to change the booking. */
  change: (phone: string | null) => string;
  rebook: string;
  kinds: Record<NotificationKind, { subject: string; body: string }>;
  /** HTML email: the pill above the greeting, per kind. */
  chip: Record<NotificationKind, string>;
  /** HTML email: the service line on the date card. */
  serviceWith: (service: string, doctor: string) => string;
}

// Placeholders: {clinic} {doctor} {service} {when}. Subjects never include the patient's name.
const PACKS: Record<LanguageCode, LanguagePack> = {
  "en-IN": {
    greeting: (n) => (n ? `Namaste ${n}.` : "Namaste."),
    change: (p) => (p ? `To change it, call ${p}.` : "To change it, call the clinic."),
    rebook: "Call the clinic to book again.",
    chip: {
      appointment_confirmed: "Appointment confirmed",
      appointment_rescheduled: "Appointment moved",
      appointment_cancelled: "Appointment cancelled",
      reminder_24h: "Reminder",
      reminder_2h: "Appointment today",
    },
    serviceWith: (s, d) => `${s} with ${d}`,
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
    chip: {
      appointment_confirmed: "अपॉइंटमेंट पक्की हुई",
      appointment_rescheduled: "अपॉइंटमेंट का समय बदला",
      appointment_cancelled: "अपॉइंटमेंट रद्द",
      reminder_24h: "याद दिलाना",
      reminder_2h: "आज अपॉइंटमेंट है",
    },
    serviceWith: (s, d) => `${d} के साथ ${s}`,
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
    chip: {
      appointment_confirmed: "ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಖಚಿತವಾಗಿದೆ",
      appointment_rescheduled: "ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಸಮಯ ಬದಲಾಗಿದೆ",
      appointment_cancelled: "ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದಾಗಿದೆ",
      reminder_24h: "ಜ್ಞಾಪನೆ",
      reminder_2h: "ಇಂದು ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್",
    },
    serviceWith: (s, d) => `${d} ಅವರೊಂದಿಗೆ ${s}`,
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
    chip: {
      appointment_confirmed: "அப்பாயிண்ட்மெண்ட் உறுதி",
      appointment_rescheduled: "அப்பாயிண்ட்மெண்ட் நேரம் மாற்றம்",
      appointment_cancelled: "அப்பாயிண்ட்மெண்ட் ரத்து",
      reminder_24h: "நினைவூட்டல்",
      reminder_2h: "இன்று அப்பாயிண்ட்மெண்ட்",
    },
    serviceWith: (s, d) => `${d} உடன் ${s}`,
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
    chip: {
      appointment_confirmed: "అపాయింట్‌మెంట్ ఖరారు",
      appointment_rescheduled: "అపాయింట్‌మెంట్ సమయం మారింది",
      appointment_cancelled: "అపాయింట్‌మెంట్ రద్దు",
      reminder_24h: "గుర్తు చేయడం",
      reminder_2h: "ఈరోజు అపాయింట్‌మెంట్",
    },
    serviceWith: (s, d) => `${d} తో ${s}`,
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

/** The design greets by first name: "Namaste Ananya." */
function firstName(name: string | null): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/** "Teeth Cleaning (RCT)" → "teeth cleaning (RCT)" for an English sentence; acronyms keep case. */
function inSentence(service: string): string {
  return service
    .split(" ")
    .map((w) => ((w.match(/[A-Z]/g)?.length ?? 0) > 1 ? w : w.toLowerCase()))
    .join(" ");
}

/**
 * A clinic number the way the design prints it: metro landlines "+91 80 4123 4567", mobiles
 * "+91 98451 23210". Other shapes are printed as stored.
 */
export function displayPhone(phone: string): string {
  const m = /^\+91(\d{10})$/.exec(phone.replace(/[\s-]/g, ""));
  if (!m) return phone;
  const d = m[1]!;
  if (/^(11|20|22|33|40|44|79|80)[2-6]/.test(d))
    return `+91 ${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  if (/^[6-9]/.test(d)) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return phone;
}

/** The three paragraphs every message has, in the recipient's language. */
function parts(kind: NotificationKind, lang: LanguageCode, vars: TemplateVars) {
  const pack = PACKS[lang];
  const phone = vars.clinicPhone ? displayPhone(vars.clinicPhone) : null;
  const sentenceVars =
    lang === "en-IN" ? { ...vars, serviceName: inSentence(vars.serviceName) } : vars;
  return {
    pack,
    phone,
    greeting: pack.greeting(firstName(vars.patientName)),
    main: fill(pack.kinds[kind].body, sentenceVars),
    tail: kind === "appointment_cancelled" ? pack.rebook : pack.change(phone),
  };
}

/**
 * Subject, plain-text body and HTML body for one message. The text body is the three paragraphs
 * separated by blank lines; the HTML is the designed email (Muxaris Emails.dc.html).
 */
export function renderNotification(
  kind: NotificationKind,
  lang: LanguageCode,
  vars: TemplateVars,
): { subject: string; body: string; html: string } {
  const p = parts(kind, lang, vars);
  const subject = fill(p.pack.kinds[kind].subject, vars);
  return {
    subject,
    body: [p.greeting, p.main, p.tail].join("\n\n"),
    html: emailHtml(kind, lang, vars, subject, p),
  };
}

// ---------------------------------------------------------------------------------------------
// HTML email. Email clients ignore most CSS, so this is nested tables with inline styles,
// web-safe font stacks behind the design's faces, no web fonts, no images, no classes.

const SANS =
  "'Schibsted Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'Noto Sans','Noto Sans Devanagari','Noto Sans Kannada','Noto Sans Tamil','Noto Sans Telugu',sans-serif";
const MONO =
  "'Geist Mono','SFMono-Regular',Menlo,Consolas,'Liberation Mono','Courier New',monospace";
const SERIF = "Fraunces,Georgia,'Times New Roman',serif";

/** Per-kind colours from the design. */
const LOOK: Record<
  NotificationKind,
  {
    accent: string;
    chipBg: string;
    chipFg: string;
    icon: string;
    cardBg: string;
    cardBorder: string;
    dateBg: string;
    dateFg: string;
    strike: boolean;
  }
> = {
  appointment_confirmed: {
    accent: "#16a34a",
    chipBg: "#e7f6ec",
    chipFg: "#15803d",
    icon: "calendarCheck",
    cardBg: "#f8fafc",
    cardBorder: "#e2e7ee",
    dateBg: "#0c1220",
    dateFg: "#ffffff",
    strike: false,
  },
  appointment_rescheduled: {
    accent: "#d98a14",
    chipBg: "#fdf1dc",
    chipFg: "#8a4b00",
    icon: "calendarSync",
    cardBg: "#fffaf0",
    cardBorder: "#f3dfb8",
    dateBg: "#0c1220",
    dateFg: "#ffffff",
    strike: false,
  },
  appointment_cancelled: {
    accent: "#e04870",
    chipBg: "#fdecef",
    chipFg: "#b4234a",
    icon: "calendarX",
    cardBg: "#f8fafc",
    cardBorder: "#e2e7ee",
    dateBg: "#eef2f6",
    dateFg: "#5f6b7c",
    strike: true,
  },
  reminder_24h: {
    accent: "#0e9a96",
    chipBg: "#e3f4f3",
    chipFg: "#0b6b70",
    icon: "bell",
    cardBg: "#f8fafc",
    cardBorder: "#e2e7ee",
    dateBg: "#0e9a96",
    dateFg: "#ffffff",
    strike: false,
  },
  reminder_2h: {
    accent: "#0e9a96",
    chipBg: "#e3f4f3",
    chipFg: "#0b6b70",
    icon: "alarmClock",
    cardBg: "#f8fafc",
    cardBorder: "#e2e7ee",
    dateBg: "#0e9a96",
    dateFg: "#ffffff",
    strike: false,
  },
};

/** Lucide icon paths (inline SVG shows in Apple Mail and iOS; Gmail and Outlook drop it). */
const ICONS: Record<string, string> = {
  calendarCheck:
    '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="m9 15 2 2 4-4"/>',
  calendarSync:
    '<path d="M11 10v4h4"/><path d="m11 14 1.535-1.605a5 5 0 018 1.5"/><path d="M16 2v3"/><path d="m21 18-1.535 1.605a5 5 0 01-8-1.5"/><path d="M21 22v-4h-4"/><path d="M21 8.517V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h3.517"/><path d="M3 9h4"/><path d="M8 2v3"/>',
  calendarX:
    '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="m14 13-4 4"/><path d="m10 13 4 4"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  alarmClock:
    '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/>',
  phone:
    '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
};

function icon(name: string, size: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin:0 8px 2px 0;" aria-hidden="true">${ICONS[name]}</svg>`;
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
/** Every interpolated value goes through this: names and addresses come from staff and patients. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

/** "JAYANAGAR · BENGALURU": the address part before the city, then the city. */
function placeLine(address: string | null | undefined, city: string | null | undefined): string {
  const c = city?.trim() ?? "";
  const bits = (address ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  const at = c ? bits.findIndex((b) => b.toLowerCase().startsWith(c.toLowerCase())) : -1;
  const locality = at > 0 ? bits[at - 1]! : "";
  return [/[A-Za-z]/.test(locality) ? locality : "", c].filter(Boolean).join(" · ");
}

function dateCard(at: Date, tz: string, lang: LanguageCode) {
  let zone = tz;
  try {
    new Intl.DateTimeFormat(lang, { timeZone: zone });
  } catch {
    zone = "Asia/Kolkata";
  }
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang, { timeZone: zone, ...o }).format(at);
  return {
    month: f({ month: "short" }).toLocaleUpperCase(lang),
    day: f({ day: "numeric" }),
    weekday: f({ weekday: "short" }).toLocaleUpperCase(lang),
    time: f({ hour: "numeric", minute: "2-digit" }),
  };
}

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

function emailHtml(
  kind: NotificationKind,
  lang: LanguageCode,
  vars: TemplateVars,
  subject: string,
  p: ReturnType<typeof parts>,
): string {
  const look = LOOK[kind];
  const e = escapeHtml;
  const clinic = e(vars.clinicName);
  const address = vars.clinicAddress?.trim() ?? "";
  const place = placeLine(address, vars.clinicCity);
  const strike = look.strike ? "text-decoration:line-through;" : "";
  const text = (css: string) => `font-family:${SANS};${css}`;

  const header = `<tr><td style="padding:22px 28px;border-bottom:1px solid #eef2f6;">
<table ${TABLE} width="100%"><tr>
<td style="${text("font-size:17px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#0c1220;")}">${clinic}</td>
${place ? `<td align="right" style="font-family:${MONO};font-size:11px;letter-spacing:0.06em;color:#5f6b7c;white-space:nowrap;padding-left:12px;">${e(place.toUpperCase())}</td>` : ""}
</tr></table>
</td></tr>`;

  const intro = `<tr><td style="padding:30px 28px 8px;">
<table ${TABLE} style="border-collapse:separate;"><tr><td style="${text(`height:28px;line-height:28px;padding:0 12px;border-radius:999px;background-color:${look.chipBg};color:${look.chipFg};font-size:13px;font-weight:600;white-space:nowrap;`)}">${icon(look.icon, 14, look.chipFg)}${e(p.pack.chip[kind])}</td></tr></table>
<p style="${text("margin:16px 0 0;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-0.025em;color:#0c1220;")}">${e(p.greeting)}</p>
<p style="${text("margin:16px 0 0;font-size:16px;line-height:1.6;color:#2c3646;")}">${e(p.main)}</p>
</td></tr>`;

  let card = "";
  if (vars.startsAt) {
    const d = dateCard(vars.startsAt, vars.timezone ?? "Asia/Kolkata", lang);
    const mono = `font-family:${MONO};font-size:11px;line-height:1.25;letter-spacing:0.1em;color:${look.dateFg};`;
    card = `<tr><td style="padding:18px 28px;">
<table ${TABLE} width="100%" style="border-collapse:separate;border:1px solid ${look.cardBorder};border-radius:16px;background-color:${look.cardBg};"><tr>
<td width="92" align="center" valign="middle" bgcolor="${look.dateBg}" style="width:92px;padding:16px 0;background-color:${look.dateBg};border-radius:15px 0 0 15px;text-align:center;">
<div style="${mono}">${e(d.month)}</div>
<div style="${text(`margin:2px 0;font-size:34px;line-height:1;font-weight:700;letter-spacing:-0.04em;color:${look.dateFg};${strike}`)}">${e(d.day)}</div>
<div style="${mono}">${e(d.weekday)}</div>
</td>
<td valign="middle" style="padding:16px 18px;">
<div style="${text(`font-size:18px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:#0c1220;${strike}`)}">${e(d.time)}</div>
<div style="${text("margin-top:4px;font-size:14.5px;line-height:1.25;color:#2c3646;")}">${e(p.pack.serviceWith(vars.serviceName, vars.doctorName))}</div>
${address || vars.clinicCity ? `<div style="${text("margin-top:4px;font-size:13px;line-height:1.25;color:#5f6b7c;")}">${e(address || vars.clinicCity || "")}</div>` : ""}
</td>
</tr></table>
</td></tr>`;
  }

  const button =
    vars.clinicPhone && p.phone
      ? `<table ${TABLE} style="margin-top:14px;border-collapse:separate;"><tr><td bgcolor="#0c1220" style="border-radius:12px;background-color:#0c1220;"><a href="tel:${e(vars.clinicPhone.replace(/[^\d+]/g, ""))}" style="${text("display:inline-block;height:46px;line-height:46px;padding:0 20px;border-radius:12px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;white-space:nowrap;")}">${icon("phone", 15, "#ffffff").replace("margin:0 8px 2px 0", "margin:0 10px 2px 0")}${e(p.phone)}</a></td></tr></table>`
      : "";
  const outro = `<tr><td style="padding:${card ? 6 : 24}px 28px 28px;">
<p style="${text("margin:0;font-size:15px;line-height:1.6;color:#2c3646;")}">${e(p.tail)}</p>
${button}
</td></tr>`;

  const footer = `<tr><td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #eef2f6;border-radius:0 0 18px 18px;">
<table ${TABLE} width="100%"><tr>
<td style="${text("font-size:12px;line-height:1.5;color:#5f6b7c;")}">${clinic}${address ? ` · ${e(address)}` : ""}</td>
<td align="right" style="${text("font-size:12px;line-height:1.5;color:#5f6b7c;white-space:nowrap;padding-left:12px;")}">Sent with <span style="font-family:${SERIF};font-size:13px;font-weight:600;letter-spacing:-0.3px;color:#0c1220;">muxar&#305;s</span><span style="display:inline-block;width:3px;height:3px;margin:3px 0 0 1px;border-radius:50%;background-color:#16a34a;vertical-align:top;"></span></td>
</tr></table>
</td></tr>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f6;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${e(p.main)}</div>
<table ${TABLE} width="100%" bgcolor="#eef2f6" style="background-color:#eef2f6;"><tr><td align="center" style="padding:28px 12px;">
<table ${TABLE} width="560" style="width:100%;max-width:560px;border-collapse:separate;background-color:#ffffff;border-radius:18px;box-shadow:0 1px 2px rgba(12,18,32,0.06);">
${header}
${intro}
${card}
${outro}
${footer}
</table>
</td></tr></table>
</body>
</html>
`;
}

/**
 * The appointment time in the clinic's zone and the recipient's language. English reads as the
 * design writes it: "Fri, 9 Oct 2026, 4:30 pm".
 */
export function formatWhen(at: Date, tz: string, lang: LanguageCode): string {
  if (lang === "en-IN") {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: tz,
      })
        .formatToParts(at)
        .map((x) => [x.type, x.value]),
    );
    const time = new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    })
      .format(at)
      .replace(/\s?(am|pm)/i, (_, m: string) => ` ${m.toLowerCase()}`);
    return `${p["weekday"]}, ${p["day"]} ${p["month"]} ${p["year"]}, ${time}`;
  }
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
