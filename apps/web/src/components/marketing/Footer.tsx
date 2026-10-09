import { CONTACT_EMAIL, FOOTER_LANGUAGES, NAV_LINKS } from "@/lib/content";
import { Mark } from "./Mark";
import { SECTION_X } from "./SectionHeader";
import { SiteLink } from "./SiteLink";

const HEADING =
  "text-muted m-0 font-mono text-[11px] font-normal tracking-[0.12em] uppercase leading-[1.5]";
const LINK = "text-ink-2 hover:text-ink text-[15px]";

export function Footer() {
  return (
    <footer className={`border-line bg-surface border-t pt-[72px] pb-[28px] ${SECTION_X}`}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-[56px]">
        <div className="grid gap-[48px] md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
          <div className="flex flex-col gap-[20px]">
            <Mark size={44} />
            <p className="m-0 max-w-[420px] text-[30px] leading-[1.15] font-semibold tracking-[-0.03em]">
              A calmer front desk, <span className="text-teal">in your language.</span>
            </p>
            <p className="text-muted m-0 text-[15px]">{FOOTER_LANGUAGES}</p>
          </div>
          <nav aria-label="Product" className="flex flex-col gap-[14px]">
            <h2 className={HEADING}>Product</h2>
            {NAV_LINKS.map((l) => (
              <SiteLink key={l.href} href={l.href} className={LINK}>
                {l.label}
              </SiteLink>
            ))}
            <SiteLink href="/sign-in" className={LINK}>
              Sign in
            </SiteLink>
          </nav>
          <nav aria-label="Company" className="flex flex-col gap-[14px]">
            <h2 className={HEADING}>Company</h2>
            <SiteLink href="/privacy" className={LINK}>
              Privacy
            </SiteLink>
            <SiteLink href="/terms" className={LINK}>
              Terms
            </SiteLink>
            <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>
        <div className="border-line text-muted flex flex-col justify-between gap-[16px] border-t pt-[24px] text-[13px] sm:flex-row">
          <span>© {new Date().getFullYear()} Muxaris. All rights reserved.</span>
          <span>Made in Bengaluru</span>
        </div>
      </div>
    </footer>
  );
}
