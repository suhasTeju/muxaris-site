export const CLINIC_COOKIE = "muxaris_clinic";

export interface ActiveClinic {
  clinicId: string;
  /** True when the cookie was missing or not one of the memberships and must be rewritten. */
  cookieStale: boolean;
}

/** Single source of truth for which clinic is active; shared by the layout and API helpers. */
export function resolveActiveClinic(
  memberships: ReadonlyArray<{ clinicId: string }>,
  cookieValue: string | null | undefined,
): ActiveClinic | null {
  const first = memberships[0];
  if (!first) return null;
  const match = memberships.find((m) => m.clinicId === cookieValue);
  return match
    ? { clinicId: match.clinicId, cookieStale: false }
    : { clinicId: first.clinicId, cookieStale: true };
}

const YEAR = 31536000;

/** The one place the clinic cookie's attributes are decided: Secure on https, SameSite=Lax, Path=/. */
export function clinicCookie(id: string | null, secure: boolean): string {
  const base = `${CLINIC_COOKIE}=${id === null ? "" : encodeURIComponent(id)}; Path=/; SameSite=Lax`;
  return `${base}; max-age=${id === null ? 0 : YEAR}${secure ? "; Secure" : ""}`;
}

/** Browser only. */
export function writeClinicCookie(id: string): void {
  document.cookie = clinicCookie(id, location.protocol === "https:");
}

/** Browser only. */
export function clearClinicCookie(): void {
  document.cookie = clinicCookie(null, location.protocol === "https:");
}
