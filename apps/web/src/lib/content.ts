import { LANGUAGES } from "@muxaris/shared";

export const SITE_URL = "https://muxaris.com";
export const CONTACT_EMAIL = "hello@muxaris.com";
export const LEGAL_UPDATED = "4 October 2026";

export const NAV_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#languages", label: "Languages" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
] as const;

export const HERO = {
  eyebrow: "AI voice receptionist for Indian clinics",
  title: "Your front desk misses calls. Muxaris doesn’t.",
  sub: "Muxaris answers every call in the caller’s own language and books the appointment into your clinic’s real calendar, so it shows on your dashboard the moment it is made.",
  note: "Browser calls today; clinic phone numbers and WhatsApp confirmations coming soon.",
} as const;

/** Clip lengths in seconds, as the design shows them (the real clips, to one decimal). */
const GREETING_SECONDS: Record<string, number> = { en: 3.0, hi: 3.7, kn: 4.4, ta: 4.0, te: 4.1 };

/** Real greeting clips, generated with the clinic greeting per language. */
export const GREETINGS = LANGUAGES.map((l) => {
  const short = l.code.slice(0, 2);
  const greeting: Record<string, string> = {
    en: "Hello, Sunrise Dental Care. How may I help you today?",
    hi: "नमस्ते, सनराइज़ डेंटल केयर। हम आपकी कैसे मदद कर सकते हैं?",
    kn: "ನಮಸ್ಕಾರ, ಸನ್‌ರೈಸ್ ಡೆಂಟಲ್ ಕೇರ್. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
    ta: "வணக்கம், சன்ரைஸ் டென்டல் கேர். நான் உங்களுக்கு எப்படி உதவலாம்?",
    te: "నమస్కారం, సన్‌రైజ్ డెంటల్ కేర్. నేను మీకు ఎలా సహాయం చేయగలను?",
  };
  return {
    code: l.code,
    label: l.label,
    native: l.native,
    greeting: greeting[short]!,
    audio: `/audio/greet-${short}.m4a`,
    seconds: GREETING_SECONDS[short]!,
  };
});

/** The scrolling greeting band under the hero. */
export const MARQUEE = [
  "Hello, Sunrise Dental Care",
  "नमस्ते, सनराइज़ डेंटल केयर",
  "ನಮಸ್ಕಾರ, ಸನ್‌ರೈಸ್ ಡೆಂಟಲ್ ಕೇರ್",
  "வணக்கம், சன்ரைஸ் டென்டல் கேர்",
  "నమస్కారం, సన్‌రైజ్ డెంటల్ కేర్",
] as const;

export const PROBLEM = {
  title: "A missed call is a missed patient.",
  aside: "Not because anyone is careless.",
  moments: [
    {
      when: "Mid-procedure",
      text: "Your assistant has gloves on and a patient in the chair. The phone rings out.",
    },
    {
      when: "After hours",
      text: "Someone with a toothache calls at 8 pm. They book with whoever picks up next.",
    },
    {
      when: "In a language the desk doesn’t share",
      text: "A caller who thinks in Kannada gets hurried English, and hangs up unsure.",
    },
  ],
} as const;

export const STEPS = [
  {
    n: "01",
    title: "The call comes in",
    text: "Muxaris answers, says that an AI assistant is on the line, and talks with the caller in their language. It asks what they need, in plain conversation.",
    img: "/img/step-call.webp",
    alt: "A woman on a phone call outdoors, looking relieved",
  },
  {
    n: "02",
    title: "It books the slot",
    text: "It checks your doctors’ real availability, offers times that are free, and books one. No double-bookings, no back-and-forth.",
    img: "/img/step-calendar.webp",
    alt: "A dentist’s appointment calendar on a tablet",
  },
  {
    n: "03",
    title: "You see the booking",
    text: "Bookings appear on your dashboard the moment they are made, with the call and transcript beside them. Patients with an email on file get a confirmation and reminders.",
    img: "/img/step-confirm.webp",
    alt: "A hand holding a phone showing a message confirmation",
  },
] as const;

export const DEMO_STAGES = [
  {
    id: "answered",
    title: "Call answered",
    text: "Muxaris answers in the caller’s language",
    at: 0,
  },
  { id: "booked", title: "Slot booked", text: "Doctor Rao, tomorrow, 4:30 pm", at: 13.6 },
  { id: "sent", title: "On your dashboard", text: "The booking appears on your dashboard", at: 18 },
] as const;

/** Timestamps (seconds) into /audio/sample-call.m4a (about 20.4 s). */
export const SAMPLE_CALL_DURATION = 20.4;
/** The silent replay holds the finished call for three seconds before it loops. */
export const DEMO_LOOP_END = SAMPLE_CALL_DURATION + 3;
export const TRANSCRIPT = [
  {
    at: 0,
    who: "caller",
    text: "Hi, I have a bad toothache since last night. Can I see the doctor tomorrow?",
  },
  {
    at: 4.3,
    who: "muxaris",
    text: "I’m sorry to hear that. Doctor Rao has a slot tomorrow at four thirty in the afternoon. Shall I book it for you?",
  },
  { at: 10.8, who: "caller", text: "Yes please, four thirty works. My name is Ananya." },
  {
    at: 13.6,
    who: "muxaris",
    text: "Done, Ananya. You’re booked at Sunrise Dental Care for tomorrow at four thirty. The clinic will confirm with you.",
  },
] as const;

export const CAPABILITIES = [
  {
    title: "Books against the real calendar",
    text: "Reads each doctor’s working hours, leave and existing appointments, and only offers slots that are genuinely free.",
  },
  {
    title: "Five languages",
    text: "English, Hindi, Kannada, Tamil and Telugu, including callers who mix them mid-sentence.",
  },
  {
    title: "Emergencies go to a human",
    text: "Severe pain, bleeding or trauma are transferred to your staff instead of being booked.",
  },
  {
    title: "Reschedules and cancellations",
    text: "Patients can move or cancel an appointment by phone, and the slot goes back into the calendar.",
  },
  {
    title: "Callbacks queue",
    text: "When a caller wants a person, or a question is outside what Muxaris knows, a callback request lands in your queue with the context.",
  },
  {
    title: "Knows your clinic",
    text: "Services, fees, timings, directions and the answers you write: it only says what you have told it.",
  },
  {
    title: "Every call logged",
    text: "Transcript, outcome and booking for each call, in your dashboard.",
  },
  {
    title: "Consent at the start",
    text: "Every call opens with a short note that an AI assistant is answering and that the call may be recorded and transcribed.",
  },
] as const;

export const SPECIALTY_CARDS = [
  {
    key: "dental",
    title: "Dental",
    text: "Where we started. Check-ups, cleanings, root canals, aligners.",
    img: "/img/spec-dental.webp",
    status: "Available now",
  },
  {
    key: "skin",
    title: "Skin and hair",
    text: "Consultations and recurring treatment sessions.",
    img: "/img/spec-skin.webp",
    status: "Coming next",
  },
  {
    key: "eye",
    title: "Eye care",
    text: "Eye tests, follow-ups and procedure bookings.",
    img: "/img/spec-eye.webp",
    status: "Coming next",
  },
  {
    key: "physio",
    title: "Physiotherapy",
    text: "Multi-session plans and recurring slots.",
    img: "/img/spec-physio.webp",
    status: "Coming next",
  },
  {
    key: "diagnostics",
    title: "Diagnostics",
    text: "Sample collection and report-pickup scheduling.",
    img: "/img/spec-diagnostic.webp",
    status: "Coming next",
  },
] as const;

export interface Plan {
  id: "pilot" | "standard";
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: readonly string[];
  cta: string;
  highlight: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    id: "pilot",
    name: "Pilot",
    price: "₹0",
    cadence: "for 30 days",
    blurb: "For the first 10 Bengaluru clinics. Try it on your real phone traffic, no card needed.",
    features: [
      "Up to 500 call-minutes",
      "All 5 languages",
      "Booking against your calendar",
      "Email confirmations and reminders",
      "Dashboard and callbacks queue",
      "Hands-on set-up with us",
    ],
    cta: "Apply for the pilot",
    highlight: false,
  },
  {
    id: "standard",
    name: "Standard",
    price: "₹4,999",
    cadence: "per month",
    blurb: "For a clinic that wants every call answered, every day.",
    features: [
      "Up to 3,000 call-minutes",
      "Unlimited bookings",
      "5 languages",
      "Email confirmations and reminders",
      "Dashboard",
      "Callbacks queue",
    ],
    cta: "Book a demo",
    highlight: true,
  },
];

export const PRICING_NOTE =
  "Prices are in Indian rupees. GST is charged extra where applicable. Calls beyond your included minutes are billed at a per-minute rate we agree with you up front; you are never cut off mid-call.";

export const FAQS = [
  {
    q: "Which languages does Muxaris speak?",
    a: "Kannada, Hindi, Tamil, Telugu, and English. Each clinic picks the languages its patients speak, and the assistant greets callers in the clinic’s own greeting for each one.",
  },
  {
    q: "Does it understand accents and mixed languages?",
    a: "Yes. Speech is transcribed with a model built for code-mixed Indic speech, so callers who mix languages mid-sentence are understood. Callers can switch mid-call; Muxaris follows.",
  },
  {
    q: "What happens in an emergency?",
    a: "Severe pain, bleeding or trauma are transferred to your staff instead of being booked. Muxaris is a scheduling and information assistant and does not give medical advice.",
  },
  {
    q: "Where is our data stored?",
    a: "In India, in AWS Mumbai. The conversation model runs on Amazon Bedrock and may be processed in other AWS regions. Call recordings are stored encrypted in AWS Mumbai, and recordings, transcripts and call summaries are deleted 90 days after the call. Clinics can turn recording off in Settings; calls are then transcribed but no audio is kept. Every call opens with a notice that an AI assistant is answering and the call may be recorded.",
  },
  {
    q: "How does booking work with our calendar?",
    a: "Muxaris reads each doctor’s working hours, leave and existing appointments, and only offers slots that are genuinely free. Bookings appear on your dashboard the moment they are made.",
  },
  {
    q: "How is pricing structured? What about overage?",
    a: "The pilot is ₹0 for 30 days with up to 500 call-minutes. Standard is ₹4,999 per month with up to 3,000 call-minutes. Calls beyond your included minutes are billed at a per-minute rate we agree with you up front; you are never cut off mid-call.",
  },
  {
    q: "How long does set-up take?",
    a: "Creating an account takes about five minutes. Onboarding then walks you through your clinic, doctors, services and assistant, and pilot clinics get hands-on set-up with us.",
  },
  {
    q: "Can it answer our existing clinic phone number?",
    a: "Not yet. Today the live product is a browser call. Clinic phone numbers, with number porting, are coming next.",
  },
] as const;

export const FOOTER_LANGUAGES = "English · हिन्दी · ಕನ್ನಡ · தமிழ் · తెలుగు";

/** Follows a "Coming next" pill under the capabilities grid. */
export const COMING_NEXT = "WhatsApp confirmations, and clinic phone numbers with number porting.";

/** "On this page" for the legal pages: each id is the id of an h2 on that page. */
export const LEGAL_TOC = {
  privacy: [
    { id: "who", label: "Who is who" },
    { id: "collect", label: "What we collect" },
    { id: "consent", label: "Consent at the start of the call" },
    { id: "use", label: "How we use it" },
    { id: "stored", label: "Where it is stored" },
    { id: "providers", label: "Service providers" },
    { id: "retention", label: "Retention" },
    { id: "rights", label: "Your rights and the DPDP Act, 2023" },
    { id: "cookies", label: "Cookies" },
    { id: "security", label: "Security" },
    { id: "changes", label: "Changes" },
  ],
  terms: [
    { id: "service", label: "The service" },
    { id: "pilot", label: "Pilot" },
    { id: "use", label: "Acceptable use" },
    { id: "medical", label: "No medical advice" },
    { id: "availability", label: "Availability" },
    { id: "fees", label: "Fees and billing" },
    { id: "data", label: "Your data" },
    { id: "termination", label: "Termination" },
    { id: "liability", label: "Liability" },
    { id: "law", label: "Governing law" },
    { id: "changes", label: "Changes" },
  ],
} as const;
export type LegalPage = keyof typeof LEGAL_TOC;
