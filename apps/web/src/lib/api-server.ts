import { cookies } from "next/headers";
import { fetchAuthSession } from "aws-amplify/auth/server";
import { runWithAmplifyServerContext } from "./amplify-server";
import { apiFetch, type ApiInit } from "./api";

export const CLINIC_COOKIE = "muxaris_clinic";

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

export async function serverApi<T>(path: string, init: ApiInit = {}): Promise<T> {
  const token = await getServerToken();
  const clinicId = init.clinicId ?? (await cookies()).get(CLINIC_COOKIE)?.value;
  return apiFetch<T>(path, { ...init, clinicId }, { token });
}
