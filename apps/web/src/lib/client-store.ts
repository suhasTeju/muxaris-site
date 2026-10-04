const VERIFY_EMAIL = "muxaris_verify_email";
const NEXT = "muxaris_next";

function get(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
function take(key: string): string | null {
  const v = get(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  return v;
}

export const verifyEmail = {
  get: () => get(VERIFY_EMAIL),
  set: (email: string) => set(VERIFY_EMAIL, email),
};
export const pendingNext = {
  set: (next: string) => set(NEXT, next),
  take: () => take(NEXT),
};
