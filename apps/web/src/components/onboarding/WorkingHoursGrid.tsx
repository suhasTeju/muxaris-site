"use client";

import { Copy } from "lucide-react";
import { Button, Input } from "@/components/ui";
import {
  DISPLAY_WEEKDAYS,
  WEEKDAY_NAMES,
  copyMondayToAll,
  validateWeekHours,
  type DayHours,
  type WeekHours,
} from "@/lib/onboarding";
import { CheckRow } from "./ui";

/** Seven day rows (150px day toggle, then opens – closes or "Closed") under "Copy Monday to all". */
export function WorkingHoursGrid({
  value,
  onChange,
  idPrefix,
}: {
  value: WeekHours;
  onChange: (next: WeekHours) => void;
  idPrefix: string;
}) {
  const errors = validateWeekHours(value);
  function patch(day: number, p: Partial<DayHours>) {
    onChange(value.map((d, i) => (i === day ? { ...d, ...p } : d)));
  }
  const labelId = `${idPrefix}-hours`;
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-center justify-between gap-[12px]">
        <span id={labelId} className="text-ink-2 text-[13.5px] font-medium">
          Working hours
        </span>
        <Button
          variant="secondary"
          size={30}
          icon={Copy}
          iconSize={13}
          onClick={() => onChange(copyMondayToAll(value))}
          className="px-[10px] text-[13px]"
        >
          Copy Monday to all
        </Button>
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        className="border-line bg-surface overflow-x-auto rounded-14 border"
      >
        <div className="flex min-w-[500px] flex-col">
          {DISPLAY_WEEKDAYS.map((day) => {
            const d = value[day]!;
            const err = errors[day];
            const name = WEEKDAY_NAMES[day]!;
            const errId = `${idPrefix}-${day}-err`;
            const time = (edge: "start" | "end") => (
              <Input
                id={`${idPrefix}-${day}-${edge}`}
                aria-label={`${name} ${edge === "start" ? "opens" : "closes"}`}
                type="time"
                size={36}
                mono
                invalid={Boolean(err)}
                aria-describedby={err ? errId : undefined}
                value={d[edge]}
                onChange={(e) =>
                  patch(day, edge === "start" ? { start: e.target.value } : { end: e.target.value })
                }
                className="w-auto px-[10px] text-[13.5px]"
              />
            );
            return (
              <div
                key={day}
                className="border-chip grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-[14px] gap-y-[6px] border-t px-[14px] py-[8px]"
              >
                <CheckRow on={d.open} onToggle={() => patch(day, { open: !d.open })}>
                  {name}
                </CheckRow>
                {d.open ? (
                  <div className="flex flex-wrap items-center gap-[10px]">
                    {time("start")}
                    <span className="text-muted-2" aria-hidden="true">
                      –
                    </span>
                    {time("end")}
                    {err ? (
                      <span id={errId} role="alert" className="text-rose text-[12.5px]">
                        {err}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-muted-2 text-[13.5px]">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
