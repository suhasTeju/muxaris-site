// packages/db/src/seed-data.ts
import { eq, sql } from "drizzle-orm";
import type { Db } from "./client.js";
import * as s from "./schema/index.js";
import { newId } from "./ids.js";

export const DEMO_CLINIC_ID = "cl_demo_sunrise";

export async function seedDemoClinic(db: Db): Promise<{ clinicId: string }> {
  await db
    .insert(s.plans)
    .values([
      {
        id: "pilot",
        name: "Pilot",
        priceInrMonthly: 0,
        includedCallMinutes: 500,
        maxConcurrentCalls: 2,
        features: ["ai_receptionist", "dashboard", "email_confirmations"],
      },
      {
        id: "standard",
        name: "Standard",
        priceInrMonthly: 4999,
        includedCallMinutes: 3000,
        maxConcurrentCalls: 5,
        features: [
          "ai_receptionist",
          "dashboard",
          "email_confirmations",
          "whatsapp",
          "reminders",
          "priority_support",
        ],
      },
    ])
    .onConflictDoUpdate({
      target: s.plans.id,
      set: {
        name: sql`excluded.name`,
        priceInrMonthly: sql`excluded.price_inr_monthly`,
        includedCallMinutes: sql`excluded.included_call_minutes`,
        maxConcurrentCalls: sql`excluded.max_concurrent_calls`,
        features: sql`excluded.features`,
      },
    });

  await db
    .insert(s.clinics)
    .values({
      id: DEMO_CLINIC_ID,
      name: "Sunrise Dental Care",
      slug: "sunrise-dental-care",
      specialty: "dental",
      city: "Bengaluru",
      address: "41, 9th Block, Jayanagar, Bengaluru 560069",
      phone: "+918041234567",
      languages: ["en-IN", "kn-IN", "hi-IN", "ta-IN", "te-IN"],
      onboardingStep: "done",
    })
    .onConflictDoNothing();

  await db
    .insert(s.doctors)
    .values([
      {
        id: "doc_demo_rao",
        clinicId: DEMO_CLINIC_ID,
        name: "Dr. Meera Rao",
        title: "BDS, General Dentistry",
        specialties: ["general", "cleaning", "fillings", "root_canal"],
        languages: ["en-IN", "kn-IN", "hi-IN"],
        color: "#16a34a",
      },
      {
        id: "doc_demo_shetty",
        clinicId: DEMO_CLINIC_ID,
        name: "Dr. Arjun Shetty",
        title: "MDS, Orthodontics",
        specialties: ["orthodontics", "braces", "aligners"],
        languages: ["en-IN", "kn-IN", "ta-IN"],
        color: "#2563eb",
      },
    ])
    .onConflictDoNothing();

  const hours = ["doc_demo_rao", "doc_demo_shetty"].flatMap((doctorId) =>
    [1, 2, 3, 4, 5, 6].map((weekday) => ({
      id: newId("wh"),
      clinicId: DEMO_CLINIC_ID,
      doctorId,
      weekday,
      startTime: "10:00",
      endTime: "20:00",
    })),
  );
  // Ids are random, so conflicts never fire: replace the demo clinic's hours to stay idempotent.
  await db.transaction(async (tx) => {
    await tx.delete(s.workingHours).where(eq(s.workingHours.clinicId, DEMO_CLINIC_ID));
    await tx.insert(s.workingHours).values(hours);
  });

  await db
    .insert(s.services)
    .values([
      {
        id: "svc_demo_consult",
        clinicId: DEMO_CLINIC_ID,
        name: "Consultation",
        durationMin: 20,
        bufferMin: 5,
        priceInr: 500,
        description: "First visit or general check-up",
      },
      {
        id: "svc_demo_cleaning",
        clinicId: DEMO_CLINIC_ID,
        name: "Teeth cleaning (scaling)",
        durationMin: 30,
        bufferMin: 10,
        priceInr: 1500,
      },
      {
        id: "svc_demo_filling",
        clinicId: DEMO_CLINIC_ID,
        name: "Filling",
        durationMin: 45,
        bufferMin: 10,
        priceInr: 2000,
      },
      {
        id: "svc_demo_rct",
        clinicId: DEMO_CLINIC_ID,
        name: "Root canal",
        durationMin: 60,
        bufferMin: 15,
        priceInr: 6000,
      },
      {
        id: "svc_demo_ortho",
        clinicId: DEMO_CLINIC_ID,
        name: "Orthodontic consultation",
        durationMin: 30,
        bufferMin: 10,
        priceInr: 800,
      },
      {
        id: "svc_demo_whitening",
        clinicId: DEMO_CLINIC_ID,
        name: "Teeth whitening",
        durationMin: 60,
        bufferMin: 10,
        priceInr: 8000,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(s.slotRules)
    .values({
      clinicId: DEMO_CLINIC_ID,
      slotGrainMin: 15,
      leadTimeMin: 60,
      maxDaysAhead: 30,
      allowSameDay: true,
      maxPerSlot: 1,
    })
    .onConflictDoNothing();

  await db
    .insert(s.assistantProfiles)
    .values({
      clinicId: DEMO_CLINIC_ID,
      name: "Muxaris",
      tone: "warm",
      handoffNumber: "+918041234567",
      greeting: {
        "en-IN": "Hello, Sunrise Dental Care. How may I help you today?",
        "hi-IN":
          "नमस्ते, सनराइज़ डेंटल केयर में आपका स्वागत है। बताइए, हम आपकी कैसे मदद कर सकते हैं?",
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
    })
    .onConflictDoUpdate({
      target: s.assistantProfiles.clinicId,
      set: {
        voices: sql`excluded.voices`,
        greeting: sql`excluded.greeting`,
      },
    });

  return { clinicId: DEMO_CLINIC_ID };
}
