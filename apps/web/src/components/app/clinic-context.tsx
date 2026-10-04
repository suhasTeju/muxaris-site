"use client";

import { createContext, useContext, useMemo } from "react";
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
const COOKIE = "muxaris_clinic";

export function ClinicProvider({
  clinics,
  activeId,
  children,
}: {
  clinics: ClinicSummary[];
  activeId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const value = useMemo<ClinicCtx>(() => {
    const activeClinic = clinics.find((c) => c.id === activeId) ?? clinics[0]!;
    return {
      clinics,
      activeClinic,
      setActiveClinic(id) {
        document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
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
