import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** The shared eyebrow / h2 / lede block. Inherits light or dark colours from its section. */
export function SectionHeader({
  eyebrow,
  children,
  aside,
  lede,
  className = "max-w-2xl",
}: {
  eyebrow: string;
  children: ReactNode;
  /** Muted italic tail of the heading. */
  aside?: ReactNode;
  lede?: ReactNode;
  className?: string;
}) {
  return (
    <Reveal className={className}>
      <p className="mx-eyebrow">{eyebrow}</p>
      <h2 className="mx-h2">
        {children}
        {aside && (
          <>
            {" "}
            <span className="text-muted [.mx-dark_&]:text-dark-muted italic">{aside}</span>
          </>
        )}
      </h2>
      {lede && <p className="mx-lede">{lede}</p>}
    </Reveal>
  );
}
