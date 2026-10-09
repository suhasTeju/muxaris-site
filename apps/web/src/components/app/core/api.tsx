"use client";

import { createContext, useContext } from "react";
import type { ApiInit } from "@/lib/api";
import { useApi } from "@/lib/api-client";

/** The signature of `useApi()`'s fetcher: path relative to the API, typed JSON back. */
export type ApiFetcher = <T>(path: string, init?: ApiInit) => Promise<T>;

const FetcherCtx = createContext<ApiFetcher | null>(null);

/**
 * Swaps the API fetcher for the Overview, Appointments, Patients and Calls views underneath.
 * Production never mounts it; the development previews in `app/dev/core` inject a fixture
 * fetcher here so the views run without a session or a server.
 */
export function ApiFetcherProvider({
  fetcher,
  children,
}: {
  fetcher: ApiFetcher;
  children: React.ReactNode;
}) {
  return <FetcherCtx.Provider value={fetcher}>{children}</FetcherCtx.Provider>;
}

/** `useApi()`, unless an `ApiFetcherProvider` above injects a different fetcher. */
export function useCoreApi(): ApiFetcher {
  const api = useApi();
  return useContext(FetcherCtx) ?? api;
}
