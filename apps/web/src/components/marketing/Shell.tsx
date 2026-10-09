import type { ReactNode } from "react";
import { LEGAL_TOC, type LegalPage } from "@/lib/content";
import { Footer } from "./Footer";
import { Nav } from "./Nav";
import { SECTION_X } from "./SectionHeader";
import { SiteLink } from "./SiteLink";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="bg-ink sr-only z-[60] rounded-full px-[16px] py-[8px] text-white focus:not-sr-only focus:fixed focus:top-[12px] focus:left-[12px] hover:text-white"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

const PILL = "rounded-pill border-line border px-[12px] py-[6px] text-[13px] font-medium";

/**
 * Privacy and Terms: a sticky "On this page" index beside a 720px article. Every h2 in the
 * article carries the id its index entry points at (LEGAL_TOC).
 */
export function LegalDoc({
  page,
  title,
  updated,
  children,
}: {
  page: LegalPage;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative pt-[120px] pb-[96px] lg:pt-[168px] lg:pb-[120px] ${SECTION_X}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background: "radial-gradient(40% 80% at 20% 0%,rgba(14,154,150,0.12),transparent 70%)",
        }}
      />
      <div className="relative mx-auto grid max-w-[1100px] items-start gap-[40px] lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-[72px]">
        <aside className="flex flex-col gap-[14px] lg:sticky lg:top-[120px]">
          <span className="text-muted font-mono text-[11px] tracking-[0.12em] uppercase">
            On this page
          </span>
          <nav aria-label="On this page" className="border-line flex flex-col gap-[2px] border-l">
            {LEGAL_TOC[page].map((t) => (
              <SiteLink
                key={t.id}
                href={`#${t.id}`}
                className="text-muted hover:border-teal hover:text-ink -ml-px border-l border-transparent py-[6px] pl-[14px] text-[14px] leading-[1.5]"
              >
                {t.label}
              </SiteLink>
            ))}
          </nav>
          <div className="flex gap-[6px] pt-[10px]">
            {(
              [
                ["privacy", "/privacy", "Privacy"],
                ["terms", "/terms", "Terms"],
              ] as const
            ).map(([key, href, label]) => (
              <SiteLink
                key={key}
                href={href}
                aria-current={page === key ? "page" : undefined}
                className={
                  page === key
                    ? `${PILL} bg-ink text-white hover:text-white`
                    : `${PILL} bg-surface text-ink-2 hover:text-ink`
                }
              >
                {label}
              </SiteLink>
            ))}
          </div>
        </aside>
        <article
          className={[
            "text-ink-2 max-w-[720px] text-[16.5px] leading-[1.7]",
            "[&_h2]:text-ink [&_h2]:mt-[48px] [&_h2]:mb-[14px] [&_h2]:text-[26px] [&_h2]:font-semibold [&_h2]:tracking-[-0.025em]",
            "[&_h2]:scroll-mt-[90px] [&_h2]:outline-none",
            "[&_p]:m-0 [&_ul]:m-0 [&_ul]:mb-[16px] [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-[10px] [&_ul]:pl-[20px]",
            "[&_strong]:text-ink [&_strong]:font-semibold",
            "[&_a]:text-teal-ink [&_a]:underline [&_a]:underline-offset-2",
          ].join(" ")}
        >
          <h1 className="text-ink m-0 mb-[14px] text-[44px] leading-none font-semibold tracking-[-0.045em] sm:text-[60px]">
            {title}
          </h1>
          <p className="text-muted !mb-[40px] font-mono text-[13px]">Last updated {updated}</p>
          {children}
        </article>
      </div>
    </section>
  );
}
