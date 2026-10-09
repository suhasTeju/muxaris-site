"use client";

import { useCallback, useEffect, useState } from "react";
import type { Clinic } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { DEFAULT_TZ } from "@/lib/dashboard";
import { useClinic } from "./clinic-context";

interface Loaded {
  key: string;
  clinic: Clinic | null;
  failed: boolean;
  failure: string | null;
}

/** The active clinic's full record (timezone, languages); tz defaults to Asia/Kolkata until loaded. */
export function useClinicProfile() {
  const api = useApi();
  const { activeClinic } = useClinic();
  const [attempt, setAttempt] = useState(0);
  const key = `${activeClinic.id}#${attempt}`;
  // Results are keyed by clinic and attempt, so a switch or a retry reads as "loading" at once.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    api<{ clinic: Clinic }>(`/v1/clinics/${activeClinic.id}`)
      .then((r) => live && setLoaded({ key, clinic: r.clinic, failed: false, failure: null }))
      .catch((e: unknown) => {
        if (!live) return;
        // A misconfigured deployment is actionable; surface its message instead of a generic one.
        const failure =
          e instanceof Error && e.message.startsWith("This deployment is misconfigured")
            ? e.message
            : null;
        setLoaded({ key, clinic: null, failed: true, failure });
      });
    return () => {
      live = false;
    };
  }, [api, activeClinic.id, key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const cur = loaded?.key === key ? loaded : null;
  const clinic = cur?.clinic ?? null;
  return {
    clinic,
    tz: clinic?.timezone ?? DEFAULT_TZ,
    failed: cur?.failed ?? false,
    failure: cur?.failure ?? null,
    retry,
  };
}
