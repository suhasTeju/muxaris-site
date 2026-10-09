"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Wordmark } from "@/components/ui/Wordmark";
import { NAV_LINKS } from "@/lib/content";
import { SiteLink } from "./SiteLink";

const GLASS =
  "border border-[rgba(255,255,255,0.9)] bg-[rgba(255,255,255,0.72)] shadow-[0_1px_0_rgba(12,18,32,0.04),0_12px_32px_-16px_rgba(12,18,32,0.18)] backdrop-blur-[18px] backdrop-saturate-[1.4]";
const LINK =
  "rounded-10 text-ink-2 block px-[14px] py-[8px] text-[14.5px] font-medium transition-colors hover:bg-[rgba(12,18,32,0.05)] hover:text-ink";
const CTA = buttonClass({ size: 40, className: "rounded-12 px-[18px] text-[14.5px]" });

/** The floating glass pill over every public page. Below 1024px the links fold into a menu. */
export function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-[14px] z-50 flex justify-center px-[12px] sm:px-[24px]">
      <div className="pointer-events-auto relative w-full max-w-[1200px]">
        <nav
          aria-label="Primary"
          className={cn(
            "rounded-18 flex h-[60px] w-full items-center justify-between gap-[24px] pr-[10px] pl-[22px]",
            GLASS,
          )}
        >
          <SiteLink href="/" aria-label="Muxaris home" className="flex items-center">
            <Wordmark width={120} />
          </SiteLink>

          <ul className="m-0 hidden list-none items-center gap-[4px] p-0 lg:flex">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <SiteLink href={l.href} className={LINK}>
                  {l.label}
                </SiteLink>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-[6px] lg:flex">
            <SiteLink href="/sign-in" className={LINK}>
              Sign in
            </SiteLink>
            <SiteLink href="/#demo" stay className={CTA}>
              Book a demo
            </SiteLink>
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="rounded-12 text-ink-2 hover:text-ink grid size-[40px] cursor-pointer place-items-center transition-colors hover:bg-[rgba(12,18,32,0.05)] lg:hidden"
          >
            {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </nav>

        {open && (
          <div
            id="mobile-menu"
            className={cn(
              "rounded-18 animate-[mxIn8_.2s_ease_both] absolute inset-x-0 top-[68px] p-[10px] lg:hidden",
              GLASS,
              "bg-[rgba(255,255,255,0.94)]",
            )}
          >
            <ul className="m-0 flex list-none flex-col p-0">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <SiteLink
                    href={l.href}
                    onClick={close}
                    className="rounded-10 text-ink-2 hover:text-ink flex min-h-[48px] items-center px-[14px] text-[17px] font-medium hover:bg-[rgba(12,18,32,0.05)]"
                  >
                    {l.label}
                  </SiteLink>
                </li>
              ))}
            </ul>
            <div className="border-line mt-[8px] grid grid-cols-2 gap-[8px] border-t pt-[10px]">
              <SiteLink
                href="/sign-in"
                onClick={close}
                className={buttonClass({
                  variant: "secondary",
                  size: 48,
                  block: true,
                  className: "font-semibold",
                })}
              >
                Sign in
              </SiteLink>
              <SiteLink
                href="/#demo"
                stay
                onClick={close}
                className={buttonClass({ size: 48, block: true })}
              >
                Book a demo
              </SiteLink>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
