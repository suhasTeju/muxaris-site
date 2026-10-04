const FRIENDLY: Record<string, string> = {
  NotAuthorizedException: "That email and password don’t match. Check them and try again.",
  UserNotFoundException: "That email and password don’t match. Check them and try again.",
  UsernameExistsException: "An account with this email already exists. Try signing in instead.",
  CodeMismatchException: "That code isn’t right. Check the latest email and try again.",
  ExpiredCodeException: "That code has expired. Request a new one.",
  LimitExceededException: "Too many attempts. Please wait a few minutes and try again.",
  InvalidPasswordException:
    "Choose a stronger password: at least 8 characters with upper and lower case letters and a number.",
  UserNotConfirmedException: "Please confirm your email first.",
};

export function authErrorName(err: unknown): string {
  return err instanceof Error ? err.name : "";
}

export function authErrorMessage(err: unknown): string {
  const name = authErrorName(err);
  if (FRIENDLY[name]) return FRIENDLY[name];
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\\\x00-\x1f]/;

/** Only allow same-origin relative redirects. */
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || UNSAFE_CHARS.test(next)) {
    return fallback;
  }
  try {
    const u = new URL(next, "https://app.invalid");
    if (u.origin !== "https://app.invalid") return fallback;
    const out = u.pathname + u.search + u.hash;
    if (!out.startsWith("/") || out.startsWith("//") || out.startsWith("/\\")) return fallback;
    return out;
  } catch {
    return fallback;
  }
}
