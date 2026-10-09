import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "ghost-teal"
  | "danger"
  | "danger-outline"
  | "danger-ghost"
  | "dashed";

/** Heights the design uses, in px. Each carries the radius, padding and type size the design pairs with it. */
export type ButtonSize = 26 | 28 | 30 | 32 | 34 | 36 | 38 | 40 | 44 | 48 | 52 | 56;

const SIZE: Record<ButtonSize, { box: string; icon: number }> = {
  26: { box: "h-[26px] rounded-7 px-[8px] gap-[6px] text-[12.5px]", icon: 13 },
  28: { box: "h-[28px] rounded-7 px-[8px] gap-[6px] text-[12.5px]", icon: 13 },
  30: { box: "h-[30px] rounded-8 px-[9px] gap-[6px] text-[12.5px]", icon: 13 },
  32: { box: "h-[32px] rounded-8 px-[10px] gap-[6px] text-[13px]", icon: 13 },
  34: { box: "h-[34px] rounded-9 px-[12px] gap-[6px] text-[13.5px]", icon: 14 },
  36: { box: "h-[36px] rounded-9 px-[12px] gap-[8px] text-[13.5px]", icon: 14 },
  38: { box: "h-[38px] rounded-10 px-[14px] gap-[8px] text-[14px]", icon: 15 },
  40: { box: "h-[40px] rounded-10 px-[16px] gap-[8px] text-[14px]", icon: 15 },
  44: { box: "h-[44px] rounded-12 px-[18px] gap-[8px] text-[14.5px]", icon: 16 },
  48: { box: "h-[48px] rounded-12 px-[20px] gap-[10px] text-[15px]", icon: 18 },
  52: { box: "h-[52px] rounded-14 px-[24px] gap-[10px] text-[16px]", icon: 18 },
  56: { box: "h-[56px] rounded-16 px-[24px] gap-[10px] text-[16px]", icon: 18 },
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white shadow-highlight font-semibold hover:bg-ink-hover hover:text-white",
  secondary: "border border-field bg-surface text-ink font-medium hover:bg-paper hover:text-ink",
  ghost: "bg-transparent text-ink-3 font-medium hover:bg-paper hover:text-ink",
  "ghost-teal": "bg-transparent text-teal-ink font-medium hover:bg-teal-soft hover:text-teal-ink",
  danger: "bg-rose text-white font-semibold hover:bg-rose-deep hover:text-white",
  "danger-outline":
    "border border-rose-line bg-surface text-rose font-semibold hover:bg-rose-soft hover:text-rose",
  "danger-ghost": "bg-transparent text-rose font-medium hover:bg-rose-soft hover:text-rose",
  dashed:
    "border border-dashed border-line-strong bg-transparent text-ink font-medium hover:border-teal hover:text-teal-ink",
};

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width, content centred. */
  block?: boolean;
  /** Square button for a lone icon (width = height). Pass an aria-label. */
  iconOnly?: boolean;
  className?: string;
}

/** The class string a Button would get, for the rare element that cannot be a Button or ButtonLink. */
export function buttonClass({
  variant = "primary",
  size = 38,
  block = false,
  iconOnly = false,
  className,
}: ButtonStyleProps = {}): string {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-colors duration-150 disabled:cursor-default disabled:opacity-70 aria-disabled:pointer-events-none aria-disabled:opacity-70",
    SIZE[size].box,
    VARIANT[variant],
    block && "flex w-full",
    iconOnly && "px-0 aspect-square",
    className,
  );
}

interface ContentProps {
  icon?: LucideIcon | undefined;
  iconRight?: LucideIcon | undefined;
  iconSize?: number | undefined;
  size: ButtonSize;
  children?: React.ReactNode;
}

function Content({ icon: Icon, iconRight: IconRight, iconSize, size, children }: ContentProps) {
  const px = iconSize ?? SIZE[size].icon;
  return (
    <>
      {Icon ? <Icon size={px} className="shrink-0" /> : null}
      {children}
      {IconRight ? <IconRight size={px} className="shrink-0" /> : null}
    </>
  );
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">, ButtonStyleProps {
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  iconSize?: number;
}

/** Design button. Defaults to type="button" so it never submits a form by accident. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size = 38,
    block,
    iconOnly,
    className,
    icon,
    iconRight,
    iconSize,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, iconOnly, className })}
      {...rest}
    >
      <Content icon={icon} iconRight={iconRight} iconSize={iconSize} size={size}>
        {children}
      </Content>
    </button>
  );
});

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href">, ButtonStyleProps {
  href: string;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  iconSize?: number;
  prefetch?: boolean;
}

/** A link that looks like a Button (Next.js Link underneath). */
export function ButtonLink({
  variant,
  size = 38,
  block,
  iconOnly,
  className,
  icon,
  iconRight,
  iconSize,
  href,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={buttonClass({ variant, size, block, iconOnly, className })}
      {...rest}
    >
      <Content icon={icon} iconRight={iconRight} iconSize={iconSize} size={size}>
        {children}
      </Content>
    </Link>
  );
}
