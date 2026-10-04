"use client";

import { useEffect, useState } from "react";
import type { Clinic } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { DEFAULT_TZ } from "@/lib/dashboard";
import { useClinic } from "./clinic-context";

/** The active clinic's full record (timezone, languages); tz defaults to Asia/Kolkata until loaded. */
export function useClinicProfile() {
  const api = useApi();
  const { activeClinic } = useClinic();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  useEffect(() => {
    let live = true;
    setClinic(null);
    api<{ clinic: Clinic }>(`/v1/clinics/${activeClinic.id}`)
      .then((r) => live && setClinic(r.clinic))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, activeClinic.id]);
  return { clinic, tz: clinic?.timezone ?? DEFAULT_TZ };
}
