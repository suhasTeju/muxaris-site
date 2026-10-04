import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL, FOOTER_LANGUAGES, NAV_LINKS } from "@/lib/content";

const linkClass =
  "text-dark-muted flex min-h-11 items-center text-sm transition-colors hover:text-white";
const headingClass = "text-dark-text/60 text-xs font-semibold tracking-[0.16em] uppercase";

export function Footer() {
  return (
    <footer data-theme="dark" className="mx-dark border-t border-white/10">
      <div className="mx-container grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr] md:gap-8">
        <div>
          <Image
            src="/brand/muxaris-mark.svg"
            alt=""
            width={36}
            height={36}
            className="rounded-lg"
          />
          <p className="font-display mt-5 max-w-xs text-2xl leading-snug tracking-tight">
            A calmer front desk,{" "}
            <span className="text-accent-bright italic">in your language.</span>
          </p>
          <p className="text-dark-muted mt-4 max-w-xs text-sm leading-relaxed">
            {FOOTER_LANGUAGES}
          </p>
        </div>
        <nav aria-label="Product">
          <h2 className={headingClass}>Product</h2>
          <ul className="mt-3">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkClass}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/sign-in" className={linkClass}>
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Company">
          <h2 className={headingClass}>Company</h2>
          <ul className="mt-3">
            <li>
              <Link href="/privacy" className={linkClass}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={linkClass}>
                Terms
              </Link>
            </li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="text-dark-muted mx-container flex flex-col gap-2 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Muxaris. All rights reserved.</p>
          <p className="font-display italic">Made in Bengaluru</p>
        </div>
      </div>
    </footer>
  );
}
