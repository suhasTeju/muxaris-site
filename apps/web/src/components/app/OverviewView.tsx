import Link from "next/link";
import { Calendar, CalendarCheck, Phone, PhoneIncoming, Timer } from "lucide-react";
import type { Appointment, Call, Doctor, Service } from "@muxaris/shared";
import { Badge, Card, KpiCard, PageHeader, SectionHeader, badgeFor } from "@/components/ui";
import {
  formatDuration,
  languageLabel,
  localDateKey,
  type OverviewStats,
  type Section,
  type Usage,
} from "@/lib/dashboard";
import { TodayAppointmentList } from "./overview/TodayAppointmentList";
import { callIcon, callerOf } from "./core/calls";
import { formatDateLong, formatDur, relativeDateTime } from "./format";
import { PAGE_TITLE_MOBILE } from "./core/layout";
import { usageCard } from "./usage";

export interface TodayAppointments {
  appointments: Appointment[];
  doctors: Doctor[];
  services: Service[];
}

const DASH = "–";

function Unavailable({ what }: { what: string }) {
  return (
    <p role="alert" className="text-rose m-0 px-[18px] py-[16px] text-[13.5px]">
      Couldn&apos;t load {what}. Refresh the page to try again.
    </p>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-muted m-0 p-[18px] text-[14px] italic">{children}</p>;
}

function usageHint(u: Usage): string {
  const over = Math.ceil(u.overageSeconds / 60);
  return usageCard(u).hint + (over > 0 ? ` · ${over} min over` : "");
}

/** Overview from AppOverview.dc.html: four KPI tiles, today's appointments by doctor, recent calls. */
export function OverviewView({
  clinicName,
  tz,
  stats,
  usage,
  appointments,
  recentCalls,
  now = new Date(),
}: {
  clinicName: string;
  tz: string;
  stats: Section<OverviewStats>;
  usage: Section<Usage>;
  appointments: Section<TodayAppointments>;
  recentCalls: Section<Call[]>;
  now?: Date;
}) {
  const todayKey = localDateKey(now, tz);
  const fail = stats.ok ? undefined : "Couldn't load";
  const card = usage.ok ? usageCard(usage.data) : null;
  // The badge on the Open callbacks tile: hidden at 0, or when the stats did not load.
  const urgent = stats.ok ? (stats.data.openUrgentCallbacks ?? 0) : 0;
  return (
    <div className="animate-mx-in flex flex-col gap-[22px]">
      <PageHeader
        className={PAGE_TITLE_MOBILE}
        title="Overview"
        subtitle={clinicName}
        actions={
          <span className="border-line bg-surface text-ink-2 inline-flex h-[32px] items-center gap-[8px] rounded-9 border px-[12px] font-mono text-[12.5px]">
            <Calendar size={13} aria-hidden="true" />
            {formatDateLong(now.toISOString(), tz)}
          </span>
        }
      />

      <section
        aria-label="Key numbers"
        className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]"
      >
        <KpiCard
          icon={Phone}
          label="Calls today"
          value={stats.ok ? String(stats.data.callsToday) : DASH}
          hint={fail ?? `Average ${formatDuration(stats.ok ? stats.data.avgDurationS : null)}`}
        />
        <KpiCard
          icon={CalendarCheck}
          label="Booked by assistant"
          value={stats.ok ? String(stats.data.bookedToday) : DASH}
          hint={fail ?? "Calls that ended in a booking today"}
        />
        <KpiCard
          icon={PhoneIncoming}
          label="Open callbacks"
          value={stats.ok ? String(stats.data.openCallbacks) : DASH}
          href="/app/callbacks"
          hint={fail ?? "View the callback queue"}
          hintTone={fail ? "muted" : "link"}
          badge={
            urgent ? (
              // Block-level, so the label row is exactly the badge's 20px as in the design.
              <Badge tone="bad" size={20} className="flex">
                {urgent} urgent
              </Badge>
            ) : undefined
          }
        />
        {usage.ok && card ? (
          <KpiCard
            icon={Timer}
            label="Minutes used this month"
            value={card.usedLabel}
            unit={`/ ${card.includedLabel}`}
            meter={{ used: card.used, included: card.included }}
            hint={usageHint(usage.data)}
          />
        ) : (
          <KpiCard icon={Timer} label="Minutes used this month" value={DASH} hint="Couldn't load" />
        )}
      </section>

      <div className="grid items-start gap-[14px] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden" aria-label="Today's appointments">
          <SectionHeader
            title="Today's appointments"
            link={{ href: "/app/appointments", label: "All appointments" }}
          />
          {!appointments.ok ? (
            <Unavailable what="today's appointments" />
          ) : appointments.data.appointments.length === 0 ? (
            <Quiet>No appointments today. Your assistant will book them as calls come in.</Quiet>
          ) : (
            <>
              <TodayAppointmentList
                appointments={appointments.data.appointments}
                doctors={appointments.data.doctors}
                services={appointments.data.services}
                tz={tz}
                now={now}
              />
              <div className="h-[10px]" />
            </>
          )}
        </Card>

        <Card className="overflow-hidden" aria-label="Recent calls">
          <SectionHeader title="Recent calls" link={{ href: "/app/calls", label: "All calls" }} />
          {!recentCalls.ok ? (
            <Unavailable what="recent calls" />
          ) : recentCalls.data.length === 0 ? (
            <Quiet>No calls yet. Try your assistant to place a first test call.</Quiet>
          ) : (
            recentCalls.data.map((c) => {
              const who = callerOf(c);
              const { icon: Icon, tile } = callIcon(c);
              const b = badgeFor("outcome", c.outcome);
              const meta = [
                relativeDateTime(c.startedAt, todayKey, tz),
                formatDur(c.durationS),
                c.languageDetected ? languageLabel(c.languageDetected) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  key={c.id}
                  href={`/app/calls/${c.id}`}
                  className="border-line-soft text-ink hover:bg-subtle hover:text-ink grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-[12px] border-t px-[18px] py-[12px]"
                >
                  <span className={`grid size-[36px] place-items-center rounded-10 ${tile}`}>
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-medium">{who.who}</span>
                    <span className="text-muted text-[12.5px]">{meta}</span>
                  </span>
                  <Badge tone={b.tone}>{b.label}</Badge>
                </Link>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
}
