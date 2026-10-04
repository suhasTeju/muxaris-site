export const LANGUAGE_CODES = ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

// Speakers verified on bulbul:v3 (docs/SPIKES.md). anushka and vidya are rejected by v3.
export const BULBUL_V3_SPEAKERS = ["shubh", "priya"] as const;
export type BulbulV3Speaker = (typeof BULBUL_V3_SPEAKERS)[number];

export const LANGUAGES: ReadonlyArray<{
  code: LanguageCode;
  label: string;
  native: string;
  sarvamSpeaker: BulbulV3Speaker; // default bulbul:v3 speaker for this language
}> = [
  { code: "en-IN", label: "English", native: "English", sarvamSpeaker: "shubh" },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी", sarvamSpeaker: "shubh" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ", sarvamSpeaker: "shubh" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்", sarvamSpeaker: "shubh" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు", sarvamSpeaker: "shubh" },
];
export const LANGUAGE_LIST = "Kannada, Hindi, Tamil, Telugu, and English";
