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
