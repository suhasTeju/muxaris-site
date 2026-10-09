"use client";

import { useState } from "react";
import { ApiFetcherProvider } from "@/components/app/core/api";
import { createFixtureApi, type FixtureOptions } from "./fixture-api";

/** Mounts the in-memory fixture API under a preview. Development only. */
export function FixtureApi({ children, ...opts }: FixtureOptions & { children: React.ReactNode }) {
  const [fetcher] = useState(() => createFixtureApi(opts));
  return <ApiFetcherProvider fetcher={fetcher}>{children}</ApiFetcherProvider>;
}
