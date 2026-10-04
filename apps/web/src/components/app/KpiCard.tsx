import Link from "next/link";

export function KpiCard({
  label,
  value,
  hint,
  ratio,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  /** 0..1: renders a usage meter. */
  ratio?: number;
  /** Makes the whole card a link. */
  href?: string;
}) {
  const card = (
    <div className="border-line bg-surface rounded-card border p-5 shadow-[0_1px_2px_rgb(12_18_32/0.04)]">
      <p className="text-muted text-sm">{label}</p>
      <p className="font-display mt-1 text-4xl tabular-nums">{value}</p>
      {ratio !== undefined && (
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,white)]"
        >
          <div
            className={`h-full rounded-full ${ratio >= 0.9 ? "bg-danger" : "bg-accent"}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
      {hint && <p className="text-muted mt-2 text-xs">{hint}</p>}
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="rounded-card block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      {card}
    </Link>
  ) : (
    card
  );
}
