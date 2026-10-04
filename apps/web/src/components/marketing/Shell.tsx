import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <noscript>
        <style>{".mx-reveal{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <a
        href="#main"
        className="bg-ink text-paper sr-only z-50 rounded-full px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
      <h1 className="font-display text-5xl leading-[1.05] font-medium tracking-[-0.035em]">
        {title}
      </h1>
      <p className="font-display text-muted mt-4 italic">Last updated {updated}</p>
      <div className="text-ink/85 mt-12 space-y-5 leading-relaxed [&_a]:text-[color-mix(in_oklch,var(--color-accent),black_25%)] [&_a]:underline [&_h2]:font-display [&_h2]:text-ink [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
        {children}
      </div>
    </article>
  );
}
