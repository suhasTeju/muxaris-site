"use client";

import { useCallback, useEffect, useState } from "react";
import type { Clinic } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { DEFAULT_TZ } from "@/lib/dashboard";
import { useClinic } from "./clinic-context";

/** The active clinic's full record (timezone, languages); tz defaults to Asia/Kolkata until loaded. */
export function useClinicProfile() {
  const api = useApi();
  const { activeClinic } = useClinic();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [failed, setFailed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setClinic(null);
    setFailed(false);
    setFailure(null);
    api<{ clinic: Clinic }>(`/v1/clinics/${activeClinic.id}`)
      .then((r) => live && setClinic(r.clinic))
      .catch((e: unknown) => {
        if (!live) return;
        setFailed(true);
        // A misconfigured deployment is actionable; surface its message instead of a generic one.
        if (e instanceof Error && e.message.startsWith("This deployment is misconfigured")) {
          setFailure(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [api, activeClinic.id, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { clinic, tz: clinic?.timezone ?? DEFAULT_TZ, failed, failure, retry };
}
