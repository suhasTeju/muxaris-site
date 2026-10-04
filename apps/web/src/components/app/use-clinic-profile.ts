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
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setClinic(null);
    setFailed(false);
    api<{ clinic: Clinic }>(`/v1/clinics/${activeClinic.id}`)
      .then((r) => live && setClinic(r.clinic))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [api, activeClinic.id, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { clinic, tz: clinic?.timezone ?? DEFAULT_TZ, failed, retry };
}
