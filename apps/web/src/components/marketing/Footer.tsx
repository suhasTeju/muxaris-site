import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL, FOOTER_LANGUAGES, NAV_LINKS } from "@/lib/content";

export function Footer() {
  return (
    <footer className="bg-ink-deep text-dark-text">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
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
          <p className="text-dark-muted mt-4 text-sm">{FOOTER_LANGUAGES}</p>
        </div>
        <div>
          <h2 className="text-dark-muted text-xs font-medium tracking-[0.16em] uppercase">
            Product
          </h2>
          <ul className="mt-4 space-y-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="hover:text-accent-bright flex min-h-11 items-center text-sm transition-colors"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/sign-in"
                className="hover:text-accent-bright flex min-h-11 items-center text-sm transition-colors"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-dark-muted text-xs font-medium tracking-[0.16em] uppercase">
            Company
          </h2>
          <ul className="mt-4 space-y-1">
            <li>
              <Link
                href="/privacy"
                className="hover:text-accent-bright flex min-h-11 items-center text-sm"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="hover:text-accent-bright flex min-h-11 items-center text-sm"
              >
                Terms
              </Link>
            </li>
            <li>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="hover:text-accent-bright flex min-h-11 items-center text-sm"
              >
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="text-dark-muted mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Muxaris. All rights reserved.</p>
          <p className="font-display italic">Made in Bengaluru</p>
        </div>
      </div>
    </footer>
  );
}
