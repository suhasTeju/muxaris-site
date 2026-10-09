/** Copy, client-side checks and states for the demo request form (shared with dev previews). */

export type DemoStatus = "idle" | "sending" | "done" | "error";

/** A state the form can open in (dev previews show the error and success states this way). */
export interface DemoFormState {
  status: DemoStatus;
  message?: string;
  errors?: Record<string, string>;
}

/** Field names as the visitor sees them, for "Please check: …". */
export const FIELD_LABELS: Record<string, string> = {
  name: "Your name",
  clinic: "Clinic name",
  city: "City",
  phone: "Mobile number",
  email: "Email",
  specialty: "Specialty",
  language: "Preferred language",
};
/** Only these fields spell out the fix under the field; the rest turn rose and are named above. */
export const FIELD_HINTS: Record<string, string> = {
  phone: "Enter a 10-digit Indian mobile number, for example 98765 43210.",
  email: "Enter a valid email address, for example you@clinic.in.",
};
export const DEMO_MESSAGES = {
  sent: "Thank you. Your demo request was sent.",
  rateLimited: "That’s a lot of requests from your network. Please try again in an hour.",
  checkDetails: "Please check your details and try again.",
  server: "Something went wrong on our side. Please try again, or email hello@muxaris.com.",
  network: "We couldn’t reach the server. Check your connection and try again.",
} as const;

export function checkMessage(fields: string[]): string {
  return `Please check: ${fields.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.`;
}

/** The checks the design runs before sending; the API validates the same rules again. */
export function validateDemo(data: Record<string, FormDataEntryValue>): Record<string, string> {
  const text = (k: string) => String(data[k] ?? "").trim();
  const errors: Record<string, string> = {};
  if (!text("name")) errors.name = "Enter your name.";
  if (!text("clinic")) errors.clinic = "Enter your clinic’s name.";
  if (!text("city")) errors.city = "Select a city.";
  const digits = text("phone")
    .replace(/\D/g, "")
    .replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) errors.phone = FIELD_HINTS.phone!;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text("email"))) errors.email = FIELD_HINTS.email!;
  return errors;
}
