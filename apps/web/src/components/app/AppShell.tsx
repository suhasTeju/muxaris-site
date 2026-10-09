"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UsageSummary } from "@muxaris/shared";
import { ToastProvider } from "@/components/ui/Toaster";
import { Sidebar, type Streamed } from "./Sidebar";
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
  children,
}: {
  email: string;
  /** Minutes for the sidebar card; the layout streams a promise, null means it failed. */
  usage: Streamed<UsageSummary | null>;
  /** Open callbacks for the sidebar badge; the layout streams a promise, null hides the badge. */
  openCallbacks: Streamed<number | null>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Escape and the backdrop hand focus back to the menu button; following a link does not.
  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) menuButton.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    // The menu exists only below 1024px: widening the window closes it, so the page is not left
    // inert behind a panel that is now the static sidebar.
    const desktop = window.matchMedia?.("(min-width: 1024px)");
    const onWide = (e: MediaQueryListEvent) => {
      if (e.matches) close(false);
    };
    document.addEventListener("keydown", onKey);
    desktop?.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop?.removeEventListener("change", onWide);
    };
  }, [open, close]);
  return (
    <ToastProvider>
      <div className="text-ink min-h-screen text-[14px] leading-[1.5] lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
        <Sidebar
          open={open}
          onNavigate={() => close(false)}
          usage={usage}
          openCallbacks={openCallbacks}
        />
        {open ? (
          <div
            aria-hidden="true"
            onClick={() => close(true)}
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
          <Topbar
            open={open}
            onToggle={() => setOpen((o) => !o)}
            menuButtonRef={menuButton}
            email={email}
          />
          {/* While the menu is open the page behind the backdrop is inert; the header stays
              reachable so its Close menu button can be found by screen readers. */}
          <main
            id="content"
            inert={open || undefined}
            className="w-full max-w-[1280px] flex-1 px-[16px] pt-[24px] pb-[56px] sm:px-[24px] lg:px-[32px] lg:pt-[28px] lg:pb-[72px]"
          >
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
