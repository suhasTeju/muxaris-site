"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

export interface ClinicSummary {
  id: string;
  name: string;
  role: string;
}

interface ClinicCtx {
  clinics: ClinicSummary[];
  activeClinic: ClinicSummary;
  setActiveClinic: (id: string) => void;
}

const Ctx = createContext<ClinicCtx | null>(null);
import { writeClinicCookie } from "@/lib/clinic";

export function ClinicProvider({
  clinics,
  activeId,
  cookieStale,
  children,
}: {
  clinics: ClinicSummary[];
  activeId: string;
  cookieStale: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    if (cookieStale) writeClinicCookie(activeId);
  }, [cookieStale, activeId]);
  const value = useMemo<ClinicCtx>(() => {
    const activeClinic = clinics.find((c) => c.id === activeId) ?? clinics[0]!;
    return {
      clinics,
      activeClinic,
      setActiveClinic(id) {
        writeClinicCookie(id);
        router.refresh();
      },
    };
  }, [clinics, activeId, router]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClinic(): ClinicCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClinic must be used inside <ClinicProvider>");
  return v;
}

export function useOptionalClinic(): ClinicCtx | null {
  return useContext(Ctx);
}
