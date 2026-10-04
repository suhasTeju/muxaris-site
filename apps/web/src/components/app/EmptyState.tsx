import Link from "next/link";

/** Quiet, illustration-free empty state: one sentence and, where it helps, one primary action. */
export function EmptyState({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-card border-line bg-surface flex flex-col items-start gap-4 border border-dashed px-6 py-8 sm:items-center sm:text-center">
      <p className="font-display text-muted max-w-md text-lg leading-snug italic">{children}</p>
      {action && (
        <Link href={action.href} className="mx-btn mx-btn-primary min-h-11 px-5 text-sm">
          {action.label}
        </Link>
      )}
    </div>
  );
}
