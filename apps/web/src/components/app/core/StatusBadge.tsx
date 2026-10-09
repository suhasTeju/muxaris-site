import { Badge, badgeFor, type BadgeKind, type BadgeSize } from "@/components/ui";

/** A status badge with the design's label and tone for `kind` (appt, outcome, cb, ...). */
export function StatusBadge({
  kind,
  value,
  size,
  className,
}: {
  kind: BadgeKind;
  value: string | null | undefined;
  size?: BadgeSize;
  className?: string;
}) {
  const b = badgeFor(kind, value);
  return (
    <Badge tone={b.tone} size={size} className={className}>
      {b.label}
    </Badge>
  );
}
