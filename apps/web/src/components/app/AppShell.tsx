"use client";

import { useEffect, useState } from "react";
import type { UsageSummary } from "@muxaris/shared";
import { ToastProvider } from "@/components/ui/Toaster";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * Signed-in frame from Muxaris App.dc.html: 244px sidebar + content column (sticky 60px header,
 * main capped at 1280px with 28px 32px 72px padding) over the paper background with a teal bloom
 * top-right. App type is 14px / 1.5. Toasts from useToast() stack bottom-right.
 */
export function AppShell({
  email,
  usage,
  openCallbacks,
  refresh = true,
  children,
}: {
  email: string;
  usage: UsageSummary | null;
  /** Open-callback count for the sidebar badge; the sidebar fetches it when omitted. */
  openCallbacks?: number;
  /** Let the sidebar fetch and refresh its counts from the API (default). */
  refresh?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <ToastProvider>
      <div className="text-ink min-h-screen text-[14px] leading-[1.5] lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
        <Sidebar
          open={open}
          onNavigate={() => setOpen(false)}
          initialUsage={usage}
          initialOpenCallbacks={openCallbacks}
          refresh={refresh}
        />
        {open ? (
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="animate-mx-fade fixed inset-0 z-40 bg-[rgba(12,18,32,0.18)] lg:hidden"
          />
        ) : null}
        <div
          className="flex min-h-screen min-w-0 flex-col"
          style={{
            background:
              "radial-gradient(40% 30% at 100% 0%, rgba(14,154,150,0.07), transparent 70%), #f4f6f9",
          }}
        >
          <Topbar open={open} onToggle={() => setOpen((o) => !o)} email={email} />
          <main
            id="content"
            className="w-full max-w-[1280px] flex-1 px-[16px] pt-[24px] pb-[56px] sm:px-[24px] lg:px-[32px] lg:pt-[28px] lg:pb-[72px]"
          >
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
