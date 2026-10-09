/**
 * Dev-preview fixture data: the design's demo clinic, transcribed from `seedDb()` (and the plan
 * values in its helpers) in `Muxaris App.dc.html`, shaped like the API responses in
 * `@muxaris/shared`. Preview pages under `app/dev` pass these to page views as props.
 *
 * Shapes follow the API, not the prototype: ISO instants in UTC, `xx-IN` language codes, E.164
 * phones, masked phones and emails on patients, calls, callbacks and notifications. Pages format
 * them for display the way the design does. Ids keep the prototype's (`p1`, `a7`, `c5`, `cb1`, `n3`)
 * so a fixture maps straight to its prototype route (`#calls/c5`, `#patients/p1`).
 *
 * People are fictitious: emails are @example.com and mobiles are +91 900000 plus four digits.
 *
 * Development only: nothing outside `app/dev` and `components/dev` may import this file.
 */
import {
  maskEmail,
  maskPhone,
  type Appointment,
  type AssistantProfile,
  type Call,
  type CallTurn,
  type Callback,
  type Clinic,
  type Doctor,
  type Notification,
  type NotificationKind,
  type Patient,
  type Role,
  type Service,
  type SlotRules,
  type UsageSummary,
} from "@muxaris/shared";

// ---------------------------------------------------------------------------------------------
// Time: the prototype's "today" is Fri 9 Oct 2026 and "now" is 2:10 pm IST.

/** Wall-clock IST date (`YYYY-MM-DD`) and time (`HH:MM`) as a UTC ISO instant, as the API sends. */
export function ist(date: string, time = "00:00"): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}
const plusSeconds = (iso: string, s: number) => new Date(Date.parse(iso) + s * 1000).toISOString();

export const FIXTURE_TODAY = "2026-10-09";
export const FIXTURE_NOW = ist(FIXTURE_TODAY, "14:10");

// ---------------------------------------------------------------------------------------------
// Clinic

export const FIXTURE_CLINIC_ID = "cl_demo_sunrise";
const CLINIC_CREATED = ist("2026-09-01", "10:00");

export const clinic: Clinic = {
  id: FIXTURE_CLINIC_ID,
  name: "Sunrise Dental Care",
  slug: "sunrise-dental-care",
  specialty: "dental",
  city: "Bengaluru",
  address: "41, 9th Block, Jayanagar, Bengaluru",
  phone: "+918041234567",
  timezone: "Asia/Kolkata",
  languages: ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN"],
  plan: "standard",
  settings: { recordCalls: true, notifications: { confirmations: true, reminders: true } },
  onboardingStep: "done",
  createdAt: CLINIC_CREATED,
  updatedAt: CLINIC_CREATED,
};

/** The second clinic in the prototype's "Switch clinic" select (multiClinic). */
export const secondClinic: Clinic = {
  ...clinic,
  id: "cl_demo_sunrise_indiranagar",
  name: "Sunrise Dental Care · Indiranagar",
  slug: "sunrise-dental-care-indiranagar",
  address: null,
};

/** Signed-in user per role, as the shell header shows it. */
export const FIXTURE_EMAIL: Record<Role, string> = {
  owner: "owner@example.com",
  front_desk: "frontdesk@example.com",
};
export const FIXTURE_USER_ID = "usr_demo_owner";

// ---------------------------------------------------------------------------------------------
// Doctors, services, slot rules, assistant

/** Mon–Sat 10:00–20:00 (the prototype's `hours()`: six days on, Sunday off). */
const WORKING_HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startTime: "10:00",
  endTime: "20:00",
}));

export const doctors: Doctor[] = [
  {
    id: "d1",
    clinicId: FIXTURE_CLINIC_ID,
    name: "Dr. Meera Rao",
    title: "BDS",
    specialties: ["General Dentistry"],
    languages: ["en-IN", "kn-IN", "hi-IN"],
    color: "#0e9a96",
    active: true,
    createdAt: CLINIC_CREATED,
    workingHours: WORKING_HOURS,
  },
  {
    id: "d2",
    clinicId: FIXTURE_CLINIC_ID,
    name: "Dr. Arjun Shetty",
    title: "MDS",
    specialties: ["Orthodontics"],
    languages: ["en-IN", "kn-IN", "ta-IN"],
    color: "#7b6fd6",
    active: true,
    createdAt: CLINIC_CREATED,
    workingHours: WORKING_HOURS,
  },
];

const service = (
  id: string,
  name: string,
  durationMin: number,
  bufferMin: number,
  priceInr: number,
  description: string | null = null,
): Service => ({
  id,
  clinicId: FIXTURE_CLINIC_ID,
  name,
  description,
  durationMin,
  bufferMin,
  priceInr,
  bookableByAi: true,
  active: true,
});

export const services: Service[] = [
  service("s1", "Consultation", 20, 5, 500, "First visit or general check-up"),
  service("s2", "Teeth cleaning (scaling)", 30, 10, 1500),
  service("s3", "Filling", 45, 10, 2000),
  service("s4", "Root canal", 60, 15, 6000),
  service("s5", "Orthodontic consultation", 30, 10, 800),
  service("s6", "Teeth whitening", 60, 10, 8000),
];

export const slotRules: SlotRules = {
  clinicId: FIXTURE_CLINIC_ID,
  slotGrainMin: 15,
  leadTimeMin: 60,
  maxDaysAhead: 30,
  allowSameDay: true,
  maxPerSlot: 1,
};

export const assistantProfile: AssistantProfile = {
  clinicId: FIXTURE_CLINIC_ID,
  name: "Muxaris",
  greeting: {
    "en-IN": "Hello, Sunrise Dental Care. How may I help you today?",
    "hi-IN": "नमस्ते, सनराइज़ डेंटल केयर। हम आपकी कैसे मदद कर सकते हैं?",
    "kn-IN": "ನಮಸ್ಕಾರ, ಸನ್‌ರೈಸ್ ಡೆಂಟಲ್ ಕೇರ್. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
    "ta-IN": "வணக்கம், சன்ரைஸ் டென்டல் கேர். நான் உங்களுக்கு எப்படி உதவலாம்?",
    "te-IN": "నమస్కారం, సన్‌రైజ్ డెంటల్ కేర్. నేను మీకు ఎలా సహాయం చేయగలను?",
  },
  voices: {
    "en-IN": "shubh",
    "hi-IN": "shubh",
    "kn-IN": "shubh",
    "ta-IN": "shubh",
    "te-IN": "shubh",
  },
  tone: "warm",
  handoffNumber: "+918041234567",
  faq: [
    {
      q: "Where is the clinic?",
      a: "41, 9th Block, Jayanagar, Bengaluru, near the Jayanagar 4th Block bus stand. Parking is available.",
    },
    {
      q: "Do you accept insurance?",
      a: "We accept most major dental insurance plans and provide bills for reimbursement.",
    },
    { q: "What are your timings?", a: "10 AM to 8 PM, Monday to Saturday. Closed on Sundays." },
  ],
  knowledge:
    "Dr. Rao handles general dentistry, cleaning, fillings and root canals. Dr. Shetty handles braces and aligners. First consultation is ₹500.",
  updatedAt: ist("2026-10-02", "11:30"),
};

// ---------------------------------------------------------------------------------------------
// Patients

/**
 * Raw numbers keyed by patient id, for previews of the reveal-phone UI. Deliberately fictitious:
 * the prototype's last four digits (so masked numbers match the design) after +91 900000.
 */
export const patientPhones: Record<string, string> = {
  p1: "+919000003210",
  p2: "+919000001187",
  p3: "+919000000923",
  p4: "+919000007314",
  p5: "+919000006655",
  p6: "+919000008401",
  p7: "+919000001742",
  p8: "+919000000128",
  p9: "+919000002036",
  p10: "+919000004821",
};

const patient = (
  id: string,
  name: string,
  lang: string,
  email: string,
  added: string,
  dob: string,
  notes: string,
): Patient => {
  const at = ist(added, "12:00");
  return {
    id,
    clinicId: FIXTURE_CLINIC_ID,
    phoneMasked: maskPhone(patientPhones[id]!),
    name: name || null,
    email: email || null,
    preferredLanguage: `${lang}-IN`,
    dob: dob || null,
    notes: notes || null,
    consentAt: null,
    createdAt: at,
    updatedAt: at,
  };
};

export const patients: Patient[] = [
  patient(
    "p1",
    "Ananya Krishnan",
    "en",
    "ananya.k@example.com",
    "2026-10-08",
    "1994-03-12",
    "Prefers late-afternoon slots.",
  ),
  patient("p2", "Rohan Mehta", "hi", "rohan.mehta@example.com", "2026-10-02", "1988-07-21", ""),
  patient(
    "p3",
    "Lakshmi Narayan",
    "kn",
    "",
    "2026-09-28",
    "1961-11-02",
    "Root canal in two sittings.",
  ),
  patient(
    "p4",
    "Karthik Iyer",
    "ta",
    "karthik.iyer@example.com",
    "2026-09-25",
    "2009-01-30",
    "Aligners, month 4.",
  ),
  patient("p5", "Priya Venkatesh", "te", "priya.v@example.com", "2026-09-21", "1991-05-17", ""),
  patient("p6", "Sneha Reddy", "te", "sneha.reddy@example.com", "2026-09-18", "1996-09-09", ""),
  patient("p7", "Mohammed Faiz", "hi", "", "2026-09-15", "1979-12-24", ""),
  patient("p8", "Deepa Gowda", "kn", "deepa.gowda@example.com", "2026-09-11", "1985-04-03", ""),
  patient("p9", "Suresh Babu", "ta", "", "2026-09-06", "1972-08-15", ""),
  patient("p10", "", "kn", "", "2026-10-09", "", ""),
];

const patientById = (id: string | null) => (id ? patients.find((p) => p.id === id) : undefined);

// ---------------------------------------------------------------------------------------------
// Calls and transcripts

type Line =
  | { who: "caller" | "assistant"; t: number; text: string }
  | { tool: string; ok: boolean; t: number };

const SAMPLE_TRANSCRIPT: Line[] = [
  {
    who: "caller",
    t: 0,
    text: "Hi, I have a bad toothache since last night. Can I see the doctor tomorrow?",
  },
  { tool: "find_slots", ok: true, t: 3 },
  {
    who: "assistant",
    t: 4.3,
    text: "I’m sorry to hear that. Doctor Rao has a slot tomorrow at four thirty in the afternoon. Shall I book it for you?",
  },
  { who: "caller", t: 10.8, text: "Yes please, four thirty works. My name is Ananya." },
  { tool: "book_appointment", ok: true, t: 12.9 },
  {
    who: "assistant",
    t: 13.6,
    text: "Done, Ananya. You’re booked at Sunrise Dental Care for tomorrow at four thirty. The clinic will confirm with you.",
  },
  { tool: "end_call", ok: true, t: 20.2 },
];

interface CallExtra {
  sentiment?: Call["sentiment"];
  summary?: string;
  /** [label, value] pairs as the prototype lists them; stored as `analysis.entities`. */
  entities?: Array<[string, string]>;
  transcript?: Line[];
  callbackId?: string;
  editedByStaff?: boolean;
  purged?: boolean;
}

/** Call turns keyed by call id (GET /v1/calls/:id returns them as `turns`). */
export const callTurns: Record<string, CallTurn[]> = {};

const call = (
  id: string,
  date: string,
  time: string,
  sec: number,
  phone: string,
  patientId: string | null,
  lang: string,
  outcome: NonNullable<Call["outcome"]>,
  status: Call["status"],
  x: CallExtra = {},
): Call => {
  const startedAt = ist(date, time);
  const endedAt = plusSeconds(startedAt, sec);
  const browser = !phone;
  const analysed = x.purged || !!x.summary;
  if (x.transcript) {
    callTurns[id] = x.transcript.map((l, seq) => ({
      id: `${id}_t${seq}`,
      clinicId: FIXTURE_CLINIC_ID,
      callId: id,
      seq,
      startedAt: plusSeconds(startedAt, l.t),
      latencyMs: null,
      ...("tool" in l
        ? {
            role: "tool" as const,
            text: null,
            toolName: l.tool,
            toolStatus: l.ok ? ("ok" as const) : ("error" as const),
          }
        : {
            role: l.who === "caller" ? ("user" as const) : ("assistant" as const),
            text: l.text,
            toolName: null,
          }),
    }));
  }
  const ready = !x.purged && status !== "abandoned" && status !== "failed";
  return {
    id,
    clinicId: FIXTURE_CLINIC_ID,
    channel: browser ? "browser" : "phone",
    callerPhoneMasked: browser ? null : maskPhone(phone),
    patientId,
    startedByUserId: browser ? FIXTURE_USER_ID : null,
    languageDetected: `${lang}-IN`,
    startedAt,
    endedAt,
    durationS: sec,
    status,
    outcome,
    recordingS3Key: ready ? `recordings/${FIXTURE_CLINIC_ID}/${id}.ogg` : null,
    transcriptS3Key: x.transcript ? `transcripts/${FIXTURE_CLINIC_ID}/${id}.json` : null,
    summary: x.summary || null,
    sentiment: x.sentiment ?? null,
    metrics: x.purged ? { purgedAt: Date.parse(ist("2026-09-30", "03:00")) } : {},
    recordingStatus: ready ? "ready" : status === "failed" ? "failed" : "none",
    outcomeSource: x.editedByStaff ? "staff" : "worker",
    analysis: x.purged
      ? { purged: true }
      : analysed
        ? {
            ...(x.entities
              ? {
                  entities: Object.fromEntries(
                    x.entities.map(([k, v]) => [k.toLowerCase().replace(/ /g, "_"), v]),
                  ),
                }
              : {}),
            needsCallback: !!x.callbackId,
          }
        : null,
    analysedAt: analysed ? plusSeconds(endedAt, 20) : null,
  };
};

/** Newest first, as GET /v1/calls returns them. */
export const calls: Call[] = [
  call("c9", "2026-10-09", "13:52", 78, "+919000006655", "p5", "en", "info", "completed", {
    sentiment: "positive",
    summary:
      "Asked whether parking is available near the clinic. Muxaris shared the address and parking details.",
    entities: [
      ["Patient", "Priya Venkatesh"],
      ["Topic", "Directions and parking"],
    ],
    transcript: [
      { who: "assistant", t: 0, text: "Hello, Sunrise Dental Care. How may I help you today?" },
      {
        who: "caller",
        t: 4.2,
        text: "Hi, I have a filling at two thirty today. Is there parking near the clinic?",
      },
      { tool: "lookup_patient", ok: true, t: 9.1 },
      { tool: "get_clinic_info", ok: true, t: 9.8 },
      {
        who: "assistant",
        t: 10.6,
        text: "Yes, Priya. We are at 41, 9th Block, Jayanagar, near the Jayanagar 4th Block bus stand, and parking is available. Your filling with Doctor Rao is at two thirty.",
      },
      { who: "caller", t: 21.4, text: "Perfect, thank you." },
      { tool: "end_call", ok: true, t: 24.0 },
    ],
  }),
  call("c8", "2026-10-09", "13:20", 58, "", null, "en", "booked", "completed", {
    sentiment: "neutral",
    summary:
      "Test call from the dashboard. Booked a consultation with Dr. Meera Rao for Mon, 12 Oct, 11:00 am.",
  }),
  call("c7", "2026-10-09", "12:47", 135, "+919000002036", "p9", "ta", "rescheduled", "completed", {
    sentiment: "neutral",
    summary:
      "Moved the orthodontic consultation with Dr. Arjun Shetty to today, 5:15 pm. Asked to speak to the doctor about aligner progress.",
    callbackId: "cb3",
    editedByStaff: true,
  }),
  call("c6", "2026-10-09", "11:05", 41, "+919000000192", null, "hi", "callback", "completed", {
    sentiment: "neutral",
    summary:
      "Asked whether the clinic does dental implants and what they cost. Requested a callback.",
    callbackId: "cb2",
  }),
  call("c5", "2026-10-09", "10:41", 182, "+919000004821", "p10", "en", "handoff", "completed", {
    sentiment: "negative",
    summary:
      "Caller reported severe pain on the lower left side since the morning. Transferred to staff; the transfer was not answered and a callback was queued.",
    callbackId: "cb1",
    entities: [
      ["Symptom", "Severe pain, lower left side"],
      ["Since", "This morning"],
    ],
    transcript: [
      { who: "assistant", t: 0, text: "Hello, Sunrise Dental Care. How may I help you today?" },
      {
        who: "caller",
        t: 3.8,
        text: "I have very bad pain on the lower left side since morning. It is getting worse, I can’t eat anything.",
      },
      {
        who: "assistant",
        t: 11.2,
        text: "I’m sorry, that sounds painful. I’m connecting you to our clinic staff right now so someone can help you.",
      },
      { tool: "transfer_to_staff", ok: false, t: 17.5 },
      {
        who: "assistant",
        t: 48.0,
        text: "Our staff could not pick up just now. I’ve asked them to call you back on this number as soon as possible.",
      },
      { tool: "request_callback", ok: true, t: 52.3 },
      { who: "caller", t: 58.1, text: "Okay, please ask them to call quickly." },
    ],
  }),
  call("c4", "2026-10-09", "09:58", 12, "+919000006604", null, "te", "abandoned", "abandoned"),
  call("c3", "2026-10-09", "08:31", 100, "+919000008401", "p6", "te", "booked", "completed", {
    sentiment: "positive",
    summary: "Booked a teeth cleaning with Dr. Meera Rao for Sat, 10 Oct, 10:30 am.",
  }),
  call("c1", "2026-10-08", "20:14", 21, "+919000003210", "p1", "en", "booked", "completed", {
    sentiment: "positive",
    summary:
      "Caller had a bad toothache since last night and asked to see the doctor tomorrow. Booked a consultation with Dr. Meera Rao for Fri, 9 Oct, 4:30 pm.",
    transcript: SAMPLE_TRANSCRIPT,
    entities: [
      ["Patient", "Ananya"],
      ["Service", "Consultation"],
      ["Doctor", "Dr. Meera Rao"],
      ["Appointment", "Fri, 9 Oct, 4:30 pm"],
      ["Reason", "Toothache since last night"],
    ],
  }),
  call("c10", "2026-10-08", "18:30", 72, "+919000001187", "p2", "hi", "booked", "completed", {
    sentiment: "positive",
    summary: "Booked a consultation with Dr. Meera Rao for Sat, 10 Oct, 5:00 pm.",
  }),
  call("c11", "2026-10-08", "16:02", 55, "+919000003018", null, "kn", "cancelled", "completed", {
    sentiment: "neutral",
    summary: "Cancelled an appointment; the slot went back into the calendar.",
  }),
  call("c12", "2026-10-08", "12:15", 150, "", null, "kn", "unknown", "failed"),
  call("c13", "2026-10-07", "19:48", 90, "+919000000128", "p8", "kn", "booked", "completed", {
    sentiment: "positive",
    summary: "Booked a filling with Dr. Meera Rao for Fri, 9 Oct, 6:00 pm.",
  }),
  call("c14", "2026-07-02", "11:20", 64, "+919000000000", null, "en", "info", "completed", {
    purged: true,
  }),
];

// ---------------------------------------------------------------------------------------------
// Appointments

/**
 * Calls that created an appointment. c1 → a7 is explicit in the prototype; the others follow from
 * the call summaries (same patient, doctor, service and time).
 */
const BOOKED_BY_CALL: Record<string, string> = { a7: "c1", a11: "c3", a13: "c10", a9: "c13" };

const appt = (
  id: string,
  date: string,
  time: string,
  dur: number,
  serviceName: string,
  patientId: string,
  doctorId: string,
  status: Appointment["status"],
  source: Appointment["source"] = "ai_call",
): Appointment => {
  const startsAt = ist(date, time);
  const p = patientById(patientId)!;
  const byCall = BOOKED_BY_CALL[id] ?? null;
  const created = byCall
    ? calls.find((c) => c.id === byCall)!.endedAt!
    : plusSeconds(ist(date, "10:00"), -86_400);
  return {
    id,
    clinicId: FIXTURE_CLINIC_ID,
    patientId,
    doctorId,
    serviceId: services.find((s) => s.name === serviceName)!.id,
    startsAt,
    endsAt: plusSeconds(startsAt, dur * 60),
    status,
    source,
    createdByCallId: byCall,
    notes: null,
    reminder24hSentAt: null,
    reminder2hSentAt: null,
    createdAt: created,
    updatedAt: created,
    patient: { name: p.name, phoneMasked: p.phoneMasked },
  };
};

/** Oldest first. Today (9 Oct) has a1–a10. */
export const appointments: Appointment[] = [
  appt("a19", "2026-10-05", "11:00", 30, "Orthodontic consultation", "p4", "d2", "completed"),
  appt(
    "a18",
    "2026-10-08",
    "15:00",
    30,
    "Teeth cleaning (scaling)",
    "p8",
    "d1",
    "completed",
    "dashboard",
  ),
  appt("a1", "2026-10-09", "10:00", 30, "Teeth cleaning (scaling)", "p2", "d1", "completed"),
  appt("a2", "2026-10-09", "10:30", 30, "Orthodontic consultation", "p4", "d2", "completed"),
  appt("a3", "2026-10-09", "11:00", 60, "Root canal", "p3", "d1", "confirmed", "dashboard"),
  appt("a4", "2026-10-09", "12:30", 20, "Consultation", "p7", "d2", "confirmed"),
  appt("a5", "2026-10-09", "14:30", 45, "Filling", "p5", "d1", "confirmed"),
  appt("a6", "2026-10-09", "15:00", 60, "Teeth whitening", "p6", "d2", "scheduled"),
  appt("a7", "2026-10-09", "16:30", 20, "Consultation", "p1", "d1", "scheduled"),
  appt("a8", "2026-10-09", "17:15", 30, "Orthodontic consultation", "p9", "d2", "rescheduled"),
  appt("a9", "2026-10-09", "18:00", 45, "Filling", "p8", "d1", "scheduled", "web"),
  appt("a10", "2026-10-09", "19:00", 20, "Consultation", "p10", "d1", "cancelled"),
  appt("a11", "2026-10-10", "10:30", 30, "Teeth cleaning (scaling)", "p6", "d1", "scheduled"),
  appt("a12", "2026-10-10", "11:15", 30, "Orthodontic consultation", "p4", "d2", "confirmed"),
  appt("a13", "2026-10-10", "17:00", 20, "Consultation", "p2", "d1", "scheduled"),
  appt("a14", "2026-10-12", "10:00", 60, "Root canal", "p3", "d1", "scheduled", "dashboard"),
  appt("a15", "2026-10-12", "16:00", 30, "Orthodontic consultation", "p7", "d2", "scheduled"),
  appt("a16", "2026-10-13", "12:00", 45, "Filling", "p5", "d1", "scheduled"),
  appt("a17", "2026-10-14", "18:30", 60, "Teeth whitening", "p8", "d2", "scheduled"),
];

// ---------------------------------------------------------------------------------------------
// Callbacks

const callback = (
  id: string,
  status: Callback["status"],
  priority: "normal" | "high" | "urgent",
  phone: string,
  callId: string,
  created: string,
  reason: string,
  assigned: string,
  note: string,
  done?: string,
): Callback => ({
  id,
  clinicId: FIXTURE_CLINIC_ID,
  callId,
  patientId: calls.find((c) => c.id === callId)?.patientId ?? null,
  phoneMasked: maskPhone(phone),
  reason,
  priority,
  status,
  assignedTo: assigned || null,
  note: note || null,
  createdAt: ist(...(created.split(" ") as [string, string])),
  doneAt: done ? ist(...(done.split(" ") as [string, string])) : null,
});

export const callbacks: Callback[] = [
  callback(
    "cb1",
    "open",
    "urgent",
    "+919000004821",
    "c5",
    "2026-10-09 10:44",
    "Severe pain on the lower left side since the morning. Transfer to staff was not answered.",
    "",
    "",
  ),
  callback(
    "cb3",
    "open",
    "high",
    "+919000002036",
    "c7",
    "2026-10-09 12:50",
    "Wants to speak to Dr. Shetty about aligner progress.",
    "Kavya",
    "",
  ),
  callback(
    "cb2",
    "open",
    "normal",
    "+919000000192",
    "c6",
    "2026-10-09 11:06",
    "Asked whether the clinic does dental implants and what they cost.",
    "",
    "",
  ),
  callback(
    "cb4",
    "done",
    "normal",
    "+919000003018",
    "c11",
    "2026-10-08 16:05",
    "Needs a copy of the bill for an insurance claim.",
    "Kavya",
    "Emailed the bill copy.",
    "2026-10-08 17:20",
  ),
  callback(
    "cb5",
    "done",
    "high",
    "+919000000128",
    "c13",
    "2026-10-07 19:50",
    "Asked if the filling can be done without anaesthetic.",
    "Dr. Meera Rao",
    "Called back and explained the options.",
    "2026-10-08 10:05",
  ),
];

/** Open callbacks: the sidebar badge (3). */
export const openCallbacksCount = callbacks.filter((c) => c.status === "open").length;

// ---------------------------------------------------------------------------------------------
// Notifications (patient emails)

type DesignType = "confirmation" | "rescheduled" | "cancelled" | "reminderDay" | "reminder2h";
const TEMPLATE: Record<DesignType, NotificationKind> = {
  confirmation: "appointment_confirmed",
  rescheduled: "appointment_rescheduled",
  cancelled: "appointment_cancelled",
  reminderDay: "reminder_24h",
  reminder2h: "reminder_2h",
};

/** The prototype's "detail" text → the API's `error` (skip-reason code, or the provider error). */
function errorFor(detail: string): string | null {
  if (!detail) return null;
  const codes: Record<string, string> = {
    "No email on file": "no_contact",
    "Channel not enabled": "channel_disabled",
    "Replaced by a later message": "superseded",
  };
  return codes[detail] ?? detail.replace(/^(Failed|Retrying after): /, "");
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The prototype's `h.dateLong` and `h.time`, on wall-clock IST values. */
function dateLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MON[m - 1]} ${y}`;
}
function clock(time: string): string {
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "pm" : "am"}`;
}

/** Subject and body exactly as the prototype's Notifications page builds them. */
function message(type: DesignType, patientId: string, apptId: string): Notification["payload"] {
  const name = clinic.name;
  const p = patientById(patientId);
  const a = appointments.find((x) => x.id === apptId)!;
  const [date, time] = new Date(Date.parse(a.startsAt) + 330 * 60_000).toISOString().split("T") as [
    string,
    string,
  ];
  const when = `${dateLong(date)}, ${clock(time.slice(0, 5))}`;
  const svc = services.find((s) => s.id === a.serviceId)!.name.toLowerCase();
  const dn = doctors.find((d) => d.id === a.doctorId)!.name;
  const subject = {
    confirmation: `Appointment confirmed at ${name}`,
    rescheduled: `Appointment moved: ${name}`,
    cancelled: `Appointment cancelled: ${name}`,
    reminderDay: `Reminder: your appointment at ${name}`,
    reminder2h: `Reminder: appointment today at ${name}`,
  }[type];
  const mid = {
    confirmation: `Your ${svc} with ${dn} at ${name} is booked for ${when}.`,
    rescheduled: `Your ${svc} with ${dn} at ${name} has been moved to ${when}.`,
    cancelled: `Your ${svc} with ${dn} at ${name} on ${when} has been cancelled.`,
    reminderDay: `A reminder that your ${svc} with ${dn} at ${name} is on ${when}.`,
    reminder2h: `Your ${svc} with ${dn} at ${name} is in about two hours, at ${when}.`,
  }[type];
  const tail =
    type === "cancelled"
      ? "Call the clinic to book again."
      : "To change it, call +91 80 4123 4567.";
  const first = p?.name ? ` ${p.name.split(" ")[0]}` : "";
  return { subject, body: `Namaste${first}.\n\n${mid}\n\n${tail}` };
}

const notification = (
  id: string,
  at: string,
  type: DesignType,
  channel: Notification["channel"],
  patientId: string,
  status: Notification["status"],
  detail: string,
  apptId: string,
): Notification => {
  const p = patientById(patientId)!;
  const createdAt = ist(...(at.split(" ") as [string, string]));
  const to =
    channel === "email"
      ? p.email
        ? maskEmail(p.email)
        : ""
      : maskPhone(patientPhones[patientId]!);
  const retrying = status === "queued" && detail.startsWith("Retrying");
  return {
    id,
    clinicId: FIXTURE_CLINIC_ID,
    patientId,
    appointmentId: apptId,
    channel,
    template: TEMPLATE[type],
    language: p.preferredLanguage,
    toMasked: to,
    status,
    error: errorFor(detail),
    providerId: status === "sent" ? `ses-${id}` : null,
    attempts: status === "sent" || status === "failed" || retrying ? 1 : 0,
    nextAttemptAt:
      status === "queued" ? (retrying ? plusSeconds(createdAt, 15 * 60) : createdAt) : null,
    payload: message(type, patientId, apptId),
    createdAt,
    sentAt: status === "sent" ? plusSeconds(createdAt, 4) : null,
  };
};

/** Newest first. */
export const notifications: Notification[] = [
  notification("n1", "2026-10-09 14:30", "reminder2h", "email", "p1", "queued", "", "a7"),
  notification(
    "n2",
    "2026-10-09 12:49",
    "rescheduled",
    "email",
    "p9",
    "skipped",
    "No email on file",
    "a8",
  ),
  notification("n3", "2026-10-09 12:30", "reminder2h", "email", "p5", "sent", "", "a5"),
  notification("n4", "2026-10-09 08:33", "confirmation", "email", "p6", "sent", "", "a11"),
  notification("n5", "2026-10-08 20:15", "confirmation", "email", "p1", "sent", "", "a7"),
  notification(
    "n6",
    "2026-10-08 18:31",
    "confirmation",
    "email",
    "p2",
    "failed",
    "Failed: Mailbox unavailable",
    "a13",
  ),
  notification(
    "n7",
    "2026-10-08 18:00",
    "reminderDay",
    "email",
    "p8",
    "queued",
    "Retrying after: Throttled by mail provider",
    "a9",
  ),
  notification("n8", "2026-10-08 14:30", "reminderDay", "email", "p5", "sent", "", "a5"),
  notification(
    "n9",
    "2026-10-08 11:15",
    "reminderDay",
    "whatsapp",
    "p4",
    "skipped",
    "Channel not enabled",
    "a2",
  ),
  notification("n10", "2026-10-07 19:50", "confirmation", "email", "p8", "sent", "", "a9"),
  notification(
    "n11",
    "2026-10-07 09:00",
    "reminderDay",
    "email",
    "p2",
    "skipped",
    "Replaced by a later message",
    "a1",
  ),
];

// ---------------------------------------------------------------------------------------------
// Usage (GET /v1/usage) for the two plans the prototype switches between.

/** Standard: 1,842 of 3,000 minutes. `calls` and token counts are not in the prototype. */
export const usageStandard: UsageSummary = {
  month: "2026-10",
  callSeconds: 1842 * 60,
  calls: 0,
  llmInputTokens: 0,
  llmOutputTokens: 0,
  includedCallMinutes: 3000,
  overageSeconds: 0,
  plan: "standard",
  planName: "Standard",
  priceInrMonthly: 4999,
  maxConcurrentCalls: 5,
  pilotEndsAt: null,
};

/** Pilot: 462 of 500 minutes (92%, the meter's hot state), ending 25 Oct 2026. */
export const usagePilot: UsageSummary = {
  ...usageStandard,
  callSeconds: 462 * 60,
  includedCallMinutes: 500,
  plan: "pilot",
  planName: "Pilot",
  priceInrMonthly: 0,
  maxConcurrentCalls: 2,
  pilotEndsAt: ist("2026-10-25", "23:59"),
};

export function usageFor(plan: "standard" | "pilot"): UsageSummary {
  return plan === "pilot" ? usagePilot : usageStandard;
}
