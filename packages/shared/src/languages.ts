export const LANGUAGE_CODES = ["en-IN", "hi-IN", "kn-IN", "ta-IN", "te-IN"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const LANGUAGES: ReadonlyArray<{
  code: LanguageCode;
  label: string;
  native: string;
  sarvamSpeaker: string; // default bulbul:v3 speaker for this language
}> = [
  { code: "en-IN", label: "English", native: "English", sarvamSpeaker: "anushka" },
  { code: "hi-IN", label: "Hindi", native: "हिन्दी", sarvamSpeaker: "anushka" },
  { code: "kn-IN", label: "Kannada", native: "ಕನ್ನಡ", sarvamSpeaker: "anushka" },
  { code: "ta-IN", label: "Tamil", native: "தமிழ்", sarvamSpeaker: "anushka" },
  { code: "te-IN", label: "Telugu", native: "తెలుగు", sarvamSpeaker: "anushka" },
];
export const LANGUAGE_LIST = "Kannada, Hindi, Tamil, Telugu, and English";
