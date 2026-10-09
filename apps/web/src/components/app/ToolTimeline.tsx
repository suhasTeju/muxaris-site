import { Card, cn } from "@/components/ui";

export interface ToolEntry {
  name: string;
  status: "started" | "done" | "failed";
  summary: string;
}

const MARK: Record<ToolEntry["status"], { glyph: string; bg: string; fg: string; label: string }> =
  {
    started: { glyph: "…", bg: "bg-warn-bg", fg: "text-warn-fg", label: "Working" },
    done: { glyph: "✓", bg: "bg-good-bg", fg: "text-good-fg", label: "Done" },
    failed: { glyph: "!", bg: "bg-bad-bg", fg: "text-bad-fg", label: "Failed" },
  };

/** What each assistant tool is doing, in words a receptionist would use. */
export const TOOL_DESCRIPTION: Record<string, string> = {
  get_clinic_info: "Checking the clinic's details",
  find_slots: "Checking free slots",
  book_appointment: "Booking the slot",
  reschedule_appointment: "Moving the appointment",
  cancel_appointment: "Cancelling the appointment",
  lookup_patient: "Looking up the caller",
  request_callback: "Asking the clinic to call back",
  transfer_to_staff: "Passing the call to the clinic",
  end_call: "Ending the call",
};

/** Try your assistant → "What the assistant is doing": one row per tool call, as it happens. */
export function ToolTimeline({ tools }: { tools: ToolEntry[] }) {
  return (
    <Card radius={18} aria-labelledby="try-tools" className="overflow-hidden">
      <h2
        id="try-tools"
        className="border-chip m-0 border-b px-[18px] py-[14px] text-[15px] font-semibold"
      >
        What the assistant is doing
      </h2>
      {tools.length === 0 ? (
        <p className="text-muted-2 m-0 p-[18px] text-[13.5px] italic">
          Checks, bookings and transfers show here as they happen.
        </p>
      ) : (
        <ol className="m-0 list-none px-0 py-[6px]">
          {tools.map((t, i) => {
            const m = MARK[t.status];
            return (
              <li
                key={i}
                data-status={t.status}
                className="animate-mx-in grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-[12px] px-[18px] py-[9px]"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-[26px] place-items-center rounded-8 font-mono text-[13px] font-semibold",
                    m.bg,
                    m.fg,
                  )}
                >
                  {m.glyph}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono text-[13px] font-medium">
                    {t.name}
                    <span className="sr-only"> ({m.label})</span>
                  </span>
                  <span className="text-muted text-[12.5px]">{TOOL_DESCRIPTION[t.name] ?? ""}</span>
                </span>
                <span className={cn("font-mono text-[12px]", m.fg)}>
                  {t.status === "started" ? "" : t.summary}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
