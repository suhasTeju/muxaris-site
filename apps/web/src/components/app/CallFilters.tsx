"use client";

import { useRouter, usePathname } from "next/navigation";
import { X } from "lucide-react";
import { CALL_OUTCOMES } from "@muxaris/shared";
import { Button, Field, Input, Select } from "@/components/ui";
import { OUTCOME_LABEL } from "@/lib/dashboard";

export interface CallFilterValue {
  outcome?: string | undefined;
  status?: string | undefined;
  /** YYYY-MM-DD in the clinic timezone. */
  from?: string | undefined;
  to?: string | undefined;
}

const KEYS = ["outcome", "status", "from", "to"] as const;
const STATUSES: Array<[string, string]> = [
  ["completed", "Completed"],
  ["in_progress", "In progress"],
  ["failed", "Failed"],
  ["abandoned", "Abandoned"],
];

/**
 * URL-driven filters: every change pushes a new query string. Paging is not part of the URL, so
 * a filter change always starts the list again from the first page.
 */
export function CallFilters({ value }: { value: CallFilterValue }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/app/calls";

  function update(key: (typeof KEYS)[number], v: string) {
    const q = new URLSearchParams();
    for (const k of KEYS) {
      const next = k === key ? v : value[k];
      if (next) q.set(k, next);
    }
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const active = KEYS.some((k) => value[k]);
  return (
    <form
      aria-label="Filter calls"
      onSubmit={(e) => e.preventDefault()}
      className="border-line flex flex-wrap items-end gap-[10px] rounded-14 border bg-[rgba(255,255,255,0.7)] p-[12px]"
    >
      <Field label="Outcome" variant="filter">
        <Select
          size={36}
          className="w-auto min-w-[160px] font-medium"
          value={value.outcome ?? ""}
          onChange={(e) => update("outcome", e.target.value)}
        >
          <option value="">All outcomes</option>
          {CALL_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABEL[o]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" variant="filter">
        <Select
          size={36}
          className="w-auto min-w-[150px] font-medium"
          value={value.status ?? ""}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" variant="filter">
        <Input
          type="date"
          size={36}
          mono
          className="w-auto font-medium"
          value={value.from ?? ""}
          max={value.to || undefined}
          onChange={(e) => update("from", e.target.value)}
        />
      </Field>
      <Field label="To" variant="filter">
        <Input
          type="date"
          size={36}
          mono
          className="w-auto font-medium"
          value={value.to ?? ""}
          min={value.from || undefined}
          onChange={(e) => update("to", e.target.value)}
        />
      </Field>
      {active ? (
        <Button
          variant="ghost-teal"
          size={36}
          icon={X}
          iconSize={13}
          className="gap-[6px]"
          onClick={() => router.push(pathname)}
        >
          Clear filters
        </Button>
      ) : null}
    </form>
  );
}
