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
  sub: "Muxaris answers every call in the caller’s own language, books the appointment into your clinic’s real calendar, and shows the booking on your dashboard the moment it is made. Email and WhatsApp confirmations are coming soon. Today you can hear it live in a browser call; clinic phone numbers are coming soon.",
  note: "Dental first. Other specialties coming next. Free 30-day pilot for the first 10 Bengaluru clinics.",
} as const;

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
  };
});

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
    text: "Bookings appear on your dashboard the moment they are made, with the call and transcript beside them. Email and WhatsApp confirmations are coming soon.",
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
    span: "lg:col-span-2",
  },
  {
    title: "Five languages",
    text: "English, Hindi, Kannada, Tamil and Telugu, including callers who mix them mid-sentence.",
    span: "",
  },
  {
    title: "Emergencies go to a human",
    text: "Severe pain, bleeding or trauma are transferred to your staff instead of being booked.",
    span: "",
  },
  {
    title: "Reschedules and cancellations",
    text: "Patients can move or cancel an appointment by phone, and the slot goes back into the calendar.",
    span: "",
  },
  {
    title: "Callbacks queue",
    text: "When a caller wants a person, or a question is outside what Muxaris knows, a callback request lands in your queue with the context.",
    span: "lg:col-span-2",
  },
  {
    title: "Knows your clinic",
    text: "Services, fees, timings, directions and the answers you write: it only says what you have told it.",
    span: "",
  },
  {
    title: "Every call logged",
    text: "Transcript, outcome and booking for each call, in your dashboard.",
    span: "",
  },
  {
    title: "Consent at the start",
    text: "Every call opens with a short note that an AI assistant is answering and that the call may be transcribed.",
    span: "",
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
      "Up to 500 calls",
      "All 5 languages",
      "Booking against your calendar",
      "Email confirmations (coming soon)",
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
      "Email confirmations (coming soon)",
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
    a: "English, Hindi, Kannada, Tamil and Telugu. The assistant greets in the language you set for your clinic and switches to whichever language the caller uses.",
  },
  {
    q: "Does it understand accents and mixed languages?",
    a: "Yes. Callers in Bengaluru often speak Kannada and English in the same sentence, and Muxaris is built to follow that. Speech recognition is by Sarvam AI, trained on Indian languages and accents. It is not perfect, so anything it is unsure about is confirmed back to the caller or sent to your callbacks queue.",
  },
  {
    q: "What happens in an emergency?",
    a: "If a caller describes severe pain, heavy bleeding, facial swelling or an accident, Muxaris does not try to book. It tells the caller it is connecting them to the clinic and transfers the call to the staff number you configure.",
  },
  {
    q: "Where is our data stored?",
    a: "Your clinic’s data is stored in India (AWS Mumbai). Speech recognition and synthesis run with Sarvam AI in India. The conversation model runs on Amazon Bedrock and may be processed in other AWS regions. Call transcripts are kept for 90 days by default. Recording storage and retention controls arrive with the call-centre release. Patient data belongs to your clinic, and we never sell it.",
  },
  {
    q: "How does booking work with our calendar?",
    a: "You set each doctor’s working hours, services and leave in Muxaris. During a call it reads those rules plus the existing appointments, offers only free slots, and writes the booking straight into the same calendar your front desk sees. Staff can move or cancel anything from the dashboard.",
  },
  {
    q: "How is pricing structured? What about overage?",
    a: "The Pilot is free for 30 days for the first 10 Bengaluru clinics, up to 500 calls. Standard is ₹4,999 per month and includes up to 3,000 call-minutes. If you go beyond that, we bill a per-minute rate agreed in advance and tell you before it happens. No lock-in, cancel any time.",
  },
  {
    q: "How long does set-up take?",
    a: "Set-up takes about 30 minutes. You add your clinic, doctors, services and hours in a guided set-up, try a test call from your browser, and you are ready.",
  },
  {
    q: "Can it answer our existing clinic phone number?",
    a: "Phone numbers and number porting are coming soon. Today you can take calls from your browser, which is the best way to hear Muxaris set up for your own clinic. Join the pilot and we will tell you the day dedicated numbers are ready.",
  },
] as const;

export const FOOTER_LANGUAGES = "English · हिन्दी · ಕನ್ನಡ · தமிழ் · తెలుగు";

export const COMING_NEXT =
  "Coming next: WhatsApp confirmations, clinic phone numbers and number porting, and recording storage with retention controls.";
