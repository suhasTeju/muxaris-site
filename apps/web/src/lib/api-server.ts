import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "./amplify-server";
import { ApiError, apiFetch, type ApiInit, type MeResponse } from "./api";
import { CLINIC_COOKIE, resolveActiveClinic } from "./clinic";
import { safeNext } from "./auth-errors";

export { CLINIC_COOKIE };

export async function getServerToken(): Promise<string | undefined> {
  try {
    const session = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: (ctx) => fetchAuthSession(ctx),
    });
    return session.tokens?.accessToken?.toString();
  } catch {
    return undefined;
  }
}

/** Where a rejected session goes; /sign-in signs the stale Amplify session out before showing the form. */
export const SESSION_EXPIRED_PATH = "/sign-in?reason=session";

/**
 * Layout and pages render in parallel, so every server API call converts a 401 into the sign-in
 * redirect itself instead of leaving it to the layout.
 */
export async function requireSession<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect(SESSION_EXPIRED_PATH);
    throw err;
  }
}

/** /v1/me, fetched at most once per request. */
export const getServerMe = cache(async (): Promise<MeResponse> => {
  return requireSession(async () =>
    apiFetch<MeResponse>("/v1/me", {}, { token: await getServerToken() }),
  );
});

/** The clinic id that the UI displays and API calls send; same resolver as the layout. */
export async function getActiveClinic() {
  const me = await getServerMe();
  const saved = (await cookies()).get(CLINIC_COOKIE)?.value;
  return resolveActiveClinic(me.memberships, saved);
}

/** The active clinic, or a redirect to onboarding when the user has none (pages render in parallel with the layout). */
export async function requireActiveClinic() {
  const active = await getActiveClinic();
  if (!active) redirect("/onboarding");
  return active;
}

export async function serverApi<T>(path: string, init: ApiInit = {}): Promise<T> {
  return requireSession(async () => {
    const token = await getServerToken();
    const clinicId = init.clinicId ?? (await getActiveClinic())?.clinicId;
    return apiFetch<T>(path, { ...init, clinicId }, { token });
  });
}

/** Path the proxy recorded for the current request, sanitised for use as `?next=`. */
export async function currentNextPath(): Promise<string> {
  return safeNext((await headers()).get("x-next-path"));
}
