import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Section rhythm from the design: 32px gutters and 128px bands at desktop, tighter below. */
export const SECTION_X = "px-[16px] sm:px-[24px] lg:px-[32px]";
export const SECTION_Y = "py-[80px] lg:py-[128px]";
/** Every site container is 1200px wide (pricing 1000, legal 1100). */
export const CONTAINER = "mx-auto w-full max-w-[1200px]";
/** In-page anchor targets sit 90px below the floating nav, as the design's scroll offset does. */
export const ANCHOR = "scroll-mt-[90px] outline-none";
/** Section headline: clamp(36px, 4vw, 54px), 1.02, -0.04em, 600. */
export const H2 =
  "m-0 text-[clamp(36px,4vw,54px)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance";
/** Page headline on pricing and FAQ: clamp(46px, 5.4vw, 76px). */
export const PAGE_H1 =
  "m-0 text-[clamp(46px,5.4vw,76px)] leading-none font-semibold tracking-[-0.048em]";

/** Mono teal eyebrow with a 6px dot ("The problem", "Live demo", …). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-teal-ink m-0 inline-flex items-center gap-[8px] font-mono text-[12px] font-medium tracking-[0.12em] uppercase",
        className,
      )}
    >
      <span aria-hidden="true" className="bg-teal size-[6px] shrink-0 rounded-full" />
      {children}
    </p>
  );
}

/** Eyebrow over an h2, 20px apart. `aside` is the tail of the heading in grey or teal. */
export function SectionHeader({
  eyebrow,
  children,
  aside,
  asideTone = "grey",
  className,
  titleClassName,
}: {
  eyebrow: string;
  children: ReactNode;
  aside?: ReactNode;
  asideTone?: "grey" | "teal";
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[20px]", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={cn(H2, titleClassName)}>
        {children}
        {aside ? (
          <>
            {" "}
            <span className={asideTone === "teal" ? "text-teal" : "text-muted-2"}>{aside}</span>
          </>
        ) : null}
      </h2>
    </div>
  );
}
