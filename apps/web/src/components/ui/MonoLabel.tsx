import { cn } from "./cn";

/** Geist Mono 11px, 0.12em, uppercase, #5f6b7c: section eyebrows ("Colour", "Type"). */
export function MonoLabel({
  as: Tag = "span",
  children,
  className,
}: {
  as?: "span" | "p" | "div" | "h2" | "h3" | "dt";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={cn("text-muted m-0 font-mono text-[11px] tracking-[0.12em] uppercase", className)}
    >
      {children}
    </Tag>
  );
}
