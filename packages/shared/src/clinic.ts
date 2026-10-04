export const SPECIALTIES = [
  "dental",
  "skin_hair",
  "eye",
  "physiotherapy",
  "diagnostics",
  "other",
] as const;
export type Specialty = (typeof SPECIALTIES)[number];
export const SPECIALTY_LABELS: Record<Specialty, string> = {
  dental: "Dental clinic",
  skin_hair: "Skin and hair clinic",
  eye: "Eye clinic",
  physiotherapy: "Physiotherapy",
  diagnostics: "Diagnostic centre",
  other: "Other",
};
export const CITIES = ["Bengaluru", "Mysuru", "Hubballi", "Chennai", "Hyderabad", "Other"] as const;
export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const ROLES = ["owner", "front_desk"] as const;
export type Role = (typeof ROLES)[number];
