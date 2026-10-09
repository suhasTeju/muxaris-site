"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

/** The design scrolls in-page targets to 90px below the top, clear of the floating nav. */
export const NAV_OFFSET = 90;

/**
 * Glides to a section on the current page and moves focus there, as a native anchor jump would.
 * Returns false (so the caller lets the browser navigate) when the target is not on this page.
 */
export function scrollToSection(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET,
    behavior: reduced ? "auto" : "smooth",
  });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}

type SiteLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /**
   * Scroll to the hash target on whichever page this is, when that page has it (the design's
   * "Book a demo" stays on /pricing and /faq, which carry their own demo form).
   */
  stay?: boolean;
};

/** A Link that smooth-scrolls when its `#hash` target is on the current page. */
export function SiteLink({ href, stay = false, onClick, ...rest }: SiteLinkProps) {
  const pathname = usePathname();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    const [path = "", id] = href.split("#");
    if (!id || !(stay || path === "" || path === pathname)) return;
    if (scrollToSection(id)) {
      e.preventDefault();
      window.history.pushState(null, "", `${pathname}#${id}`);
    }
  };
  return <Link href={href} onClick={handle} {...rest} />;
}
