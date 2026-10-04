"use client";

import { useCallback } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { apiFetch, type ApiInit } from "./api";
import { assertRuntimeEnv } from "./env";
import { configureAmplify } from "./amplify";
import { useOptionalClinic } from "@/components/app/clinic-context";

export async function getAccessToken(): Promise<string | undefined> {
  configureAmplify();
  const session = await fetchAuthSession();
  return session.tokens?.accessToken?.toString();
}

/** Defaults X-Clinic-Id to the resolved active clinic shown in the UI. */
export function useApi() {
  const activeId = useOptionalClinic()?.activeClinic.id;
  return useCallback(
    async <T>(path: string, init: ApiInit = {}): Promise<T> => {
      assertRuntimeEnv();
      return apiFetch<T>(
        path,
        { ...init, clinicId: init.clinicId ?? activeId },
        { token: await getAccessToken() },
      );
    },
    [activeId],
  );
}
