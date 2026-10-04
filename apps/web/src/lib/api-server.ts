import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { fetchAuthSession } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "./amplify-server";
import { apiFetch, type ApiInit, type MeResponse } from "./api";
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

/** /v1/me, fetched at most once per request. */
export const getServerMe = cache(async (): Promise<MeResponse> => {
  return apiFetch<MeResponse>("/v1/me", {}, { token: await getServerToken() });
});

/** The clinic id that the UI displays and API calls send; same resolver as the layout. */
export async function getActiveClinic() {
  const me = await getServerMe();
  const saved = (await cookies()).get(CLINIC_COOKIE)?.value;
  return resolveActiveClinic(me.memberships, saved);
}

export async function serverApi<T>(path: string, init: ApiInit = {}): Promise<T> {
  const token = await getServerToken();
  const clinicId = init.clinicId ?? (await getActiveClinic())?.clinicId;
  return apiFetch<T>(path, { ...init, clinicId }, { token });
}

/** Path the proxy recorded for the current request, sanitised for use as `?next=`. */
export async function currentNextPath(): Promise<string> {
  return safeNext((await headers()).get("x-next-path"));
}
