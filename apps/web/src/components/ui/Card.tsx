import { cn } from "./cn";

type CardElement = "div" | "section" | "article" | "aside" | "li";

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: CardElement;
  /** 16 for page cards (default), 18 for the patient and try-call panels, 20 for hero panels. */
  radius?: 16 | 18 | 20;
}

const RADIUS = { 16: "rounded-16", 18: "rounded-18", 20: "rounded-20" } as const;

/**
 * White card: 1px #e2e7ee border, 0 1px 2px rgba(12,18,32,0.04) shadow. No padding: lists and
 * tables run edge to edge, so add padding (usually p-[18px] or p-[20px]) where the design has it.
 */
export function Card({ as: Tag = "section", radius = 16, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn("border-line bg-surface shadow-rest border", RADIUS[radius], className)}
      {...rest}
    />
  );
}
