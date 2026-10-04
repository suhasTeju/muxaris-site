"use client";

import { useCallback } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { apiFetch, type ApiInit } from "./api";
import { configureAmplify } from "./amplify";

export async function getAccessToken(): Promise<string | undefined> {
  configureAmplify();
  const session = await fetchAuthSession();
  return session.tokens?.accessToken?.toString();
}

export function useApi() {
  return useCallback(
    async <T>(path: string, init: ApiInit = {}): Promise<T> =>
      apiFetch<T>(path, init, { token: await getAccessToken() }),
    [],
  );
}
