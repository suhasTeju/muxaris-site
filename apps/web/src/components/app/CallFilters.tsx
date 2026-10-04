"use client";

import { useRouter, usePathname } from "next/navigation";
import { CALL_OUTCOMES } from "@muxaris/shared";
import { OUTCOME_LABEL } from "@/lib/dashboard";
import { fieldClass, ghostBtn } from "./Modal";

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
      className="mb-6 flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Outcome</span>
        <select
          className={fieldClass}
          value={value.outcome ?? ""}
          onChange={(e) => update("outcome", e.target.value)}
        >
          <option value="">All outcomes</option>
          {CALL_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {OUTCOME_LABEL[o]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Status</span>
        <select
          className={fieldClass}
          value={value.status ?? ""}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">From</span>
        <input
          type="date"
          className={fieldClass}
          value={value.from ?? ""}
          max={value.to || undefined}
          onChange={(e) => update("from", e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">To</span>
        <input
          type="date"
          className={fieldClass}
          value={value.to ?? ""}
          min={value.from || undefined}
          onChange={(e) => update("to", e.target.value)}
        />
      </label>
      {active ? (
        <button type="button" className={ghostBtn} onClick={() => router.push(pathname)}>
          Clear filters
        </button>
      ) : null}
    </form>
  );
}
