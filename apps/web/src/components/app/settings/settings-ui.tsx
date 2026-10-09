import { Pencil } from "lucide-react";
import { Button, Card, cn } from "@/components/ui";

export const OWNER_ONLY = "Only the clinic owner can change this.";

/** A settings card: white r16 card with a 16px/20px header row (h2 15.5px) over an #eef2f6 rule. */
export function SettingsSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card
      as="section"
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-[80px] overflow-hidden"
    >
      <div className="border-chip flex items-center justify-between gap-[12px] border-b px-[20px] py-[16px]">
        <h2 id={`${id}-title`} className="m-0 text-[15.5px] font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

/** Header note front-desk users see instead of an Edit button. */
export function OwnerOnlyNote({ children = OWNER_ONLY }: { children?: React.ReactNode }) {
  return <span className="text-muted text-[12.5px]">{children}</span>;
}

/** Edit / Cancel + Save in a section header (32px buttons). */
export function EditActions({
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  label,
}: {
  editing: boolean;
  busy?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  /** Accessible name suffix, e.g. "clinic details". */
  label: string;
}) {
  if (!editing) {
    return (
      <Button
        variant="secondary"
        size={32}
        icon={Pencil}
        onClick={onEdit}
        aria-label={`Edit ${label}`}
      >
        Edit
      </Button>
    );
  }
  return (
    <div className="flex gap-[6px]">
      <Button variant="secondary" size={32} onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button
        size={32}
        onClick={onSave}
        disabled={busy}
        aria-label={`Save ${label}`}
        className="px-[12px] shadow-none"
      >
        Save
      </Button>
    </div>
  );
}

/** Definition grid: 14px/20px cells over an #f1f4f7 rule, 12.5px muted term, 14.5px value. */
export function DefList({
  rows,
  cols = 2,
}: {
  rows: Array<[term: string, value: React.ReactNode]>;
  cols?: 2 | 3;
}) {
  return (
    <dl
      className={cn(
        "m-0 grid grid-cols-1",
        cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="border-line-soft flex min-w-0 flex-col gap-[4px] border-b px-[20px] py-[14px]"
        >
          <dt className="text-muted text-[12.5px]">{k}</dt>
          <dd className="m-0 text-[14.5px] break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Inline failure line under a section's body. */
export function SectionError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-rose m-0 px-[20px] pb-[16px] text-[13px]">
      {children}
    </p>
  );
}

/** Empty-section line (20px, 14px italic muted). */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted m-0 p-[20px] text-[14px] italic">{children}</p>;
}

/**
 * Toggle chips for languages (Clinic edit 34px, doctor drawer 32px): teal tint when on.
 * role="checkbox" per chip, as the design marks them up.
 */
export function ToggleChips({
  options,
  value,
  onChange,
  size = 34,
  label,
}: {
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (next: string[]) => void;
  size?: 32 | 34;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap", size === 34 ? "gap-[8px]" : "gap-[6px]")}
    >
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              "cursor-pointer border font-medium transition-colors duration-150",
              size === 34
                ? "h-[34px] rounded-9 px-[12px] text-[13.5px]"
                : "h-[32px] rounded-8 px-[11px] text-[13px]",
              on
                ? "border-teal-border bg-teal-tint text-teal-deep"
                : "border-field bg-surface text-ink-3",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
