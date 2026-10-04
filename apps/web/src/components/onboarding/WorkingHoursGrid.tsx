"use client";

import {
  DISPLAY_WEEKDAYS,
  WEEKDAY_NAMES,
  copyMondayToAll,
  validateWeekHours,
  type DayHours,
  type WeekHours,
} from "@/lib/onboarding";
import { Btn } from "./ui";

const timeCls =
  "border-line bg-paper text-ink focus:border-accent focus:ring-accent-soft min-h-11 rounded-lg border px-3 py-2 text-base outline-none focus:ring-4 disabled:opacity-40";

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
  return (
    <fieldset>
      <legend className="text-ink text-sm font-medium">Working hours</legend>
      <div className="mt-1 flex justify-end">
        <Btn variant="ghost" onClick={() => onChange(copyMondayToAll(value))}>
          Copy Monday to all
        </Btn>
      </div>
      <ul className="divide-line border-line mt-2 divide-y rounded-xl border">
        {DISPLAY_WEEKDAYS.map((day) => {
          const d = value[day]!;
          const err = errors[day];
          const base = `${idPrefix}-${day}`;
          const errId = `${base}-err`;
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
              <label className="text-ink flex min-h-11 w-36 cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={d.open}
                  onChange={(e) => patch(day, { open: e.target.checked })}
                  className="accent-accent focus-visible:ring-accent-soft size-5 rounded outline-none focus-visible:ring-4"
                />
                {WEEKDAY_NAMES[day]}
              </label>
              {d.open ? (
                <div className="flex items-center gap-2">
                  <input
                    id={`${base}-start`}
                    aria-label={`${WEEKDAY_NAMES[day]} opens`}
                    type="time"
                    value={d.start}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? errId : undefined}
                    onChange={(e) => patch(day, { start: e.target.value })}
                    className={timeCls}
                  />
                  <span className="text-muted text-sm">to</span>
                  <input
                    id={`${base}-end`}
                    aria-label={`${WEEKDAY_NAMES[day]} closes`}
                    type="time"
                    value={d.end}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? errId : undefined}
                    onChange={(e) => patch(day, { end: e.target.value })}
                    className={timeCls}
                  />
                </div>
              ) : (
                <span className="text-muted text-sm">Closed</span>
              )}
              {err ? (
                <p id={errId} role="alert" className="text-danger basis-full text-sm">
                  {err}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
