import Link from "next/link";
import { Fragment } from "react";
import type { Appointment, Doctor, Service } from "@muxaris/shared";
import { Badge, badgeFor, cn } from "@/components/ui";
import { formatTime, groupByDoctor } from "@/lib/dashboard";

export interface TodayAppointmentListProps {
  appointments: Appointment[];
  doctors: Pick<Doctor, "id" | "name" | "color">[];
  services: Pick<Service, "id" | "name">[];
  tz: string;
  /** "Now" for the NOW marker and the dimmed past rows. */
  now: Date;
}

/**
 * Overview's "Today's appointments": one group per doctor (colour dot, name, count), mono times,
 * a NOW marker before the first appointment still to start, and past or cancelled rows dimmed
 * (cancelled ones struck through). Rows open the appointment on the Appointments page.
 */
export function TodayAppointmentList({
  appointments,
  doctors,
  services,
  tz,
  now,
}: TodayAppointmentListProps) {
  const service = new Map(services.map((s) => [s.id, s.name]));
  const nowMs = now.getTime();
  const nowLabel = `NOW · ${formatTime(now.toISOString(), tz).toUpperCase()}`;
  return (
    <>
      {groupByDoctor(appointments, doctors).map((g) => {
        let placed = false;
        return (
          <div key={g.doctorId} className="flex flex-col">
            <div className="flex items-center gap-[10px] px-[18px] pt-[12px] pb-[6px]">
              <span
                aria-hidden="true"
                className="size-[8px] shrink-0 rounded-full"
                style={{ background: g.color ?? "#8a95a5" }}
              />
              <h3 className="m-0 text-[13.5px] font-semibold">{g.doctorName}</h3>
              <span className="text-muted font-mono text-[11.5px]">{g.items.length}</span>
            </div>
            {g.items.map((a) => {
              const start = Date.parse(a.startsAt);
              const nowLine = !placed && start > nowMs;
              if (nowLine) placed = true;
              const cancelled = a.status === "cancelled";
              const b = badgeFor("appt", a.status);
              return (
                <Fragment key={a.id}>
                  {nowLine ? (
                    <div className="flex items-center gap-[8px] px-[18px] py-[2px]">
                      <span className="text-teal-ink font-mono text-[10.5px] tracking-[0.06em]">
                        {nowLabel}
                      </span>
                      <span aria-hidden="true" className="bg-teal h-px flex-1" />
                    </div>
                  ) : null}
                  <Link
                    href={`/app/appointments?id=${encodeURIComponent(a.id)}`}
                    className="text-ink hover:bg-subtle hover:text-ink grid grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-[12px] px-[18px] py-[9px]"
                    style={{ opacity: start < nowMs || cancelled ? 0.55 : 1 }}
                  >
                    <span className="text-ink-2 font-mono text-[12.5px]">
                      {formatTime(a.startsAt, tz)}
                    </span>
                    <span
                      className={cn(
                        "overflow-hidden text-[14px] text-ellipsis whitespace-nowrap",
                        cancelled && "line-through",
                      )}
                    >
                      {service.get(a.serviceId) ?? "Appointment"}{" "}
                      <span className="text-muted">· {a.patient?.name || "Unnamed"}</span>
                    </span>
                    <Badge tone={b.tone}>{b.label}</Badge>
                  </Link>
                </Fragment>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
