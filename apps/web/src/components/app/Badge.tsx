import type { Appointment, Call } from "@muxaris/shared";
import { OUTCOME_LABEL } from "@/lib/dashboard";

type Tone = "good" | "warn" | "bad" | "muted";

const TONES: Record<Tone, string> = {
  good: "bg-accent-soft text-accent-deep",
  warn: "bg-[color-mix(in_srgb,#d97706_16%,white)] text-[#8a4b04]",
  bad: "bg-danger-soft text-danger",
  muted: "bg-[color-mix(in_srgb,var(--color-ink)_7%,white)] text-muted",
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const APPT: Record<Appointment["status"], [Tone, string]> = {
  scheduled: ["muted", "Scheduled"],
  confirmed: ["good", "Confirmed"],
  rescheduled: ["warn", "Rescheduled"],
  cancelled: ["bad", "Cancelled"],
  completed: ["good", "Completed"],
  no_show: ["bad", "No-show"],
};

export function AppointmentStatusBadge({ status }: { status: Appointment["status"] }) {
  const [tone, label] = APPT[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: Call["outcome"] }) {
  if (!outcome) return <Badge tone="muted">-</Badge>;
  const tone: Tone =
    outcome === "booked" || outcome === "rescheduled"
      ? "good"
      : outcome === "handoff" || outcome === "callback"
        ? "warn"
        : outcome === "abandoned"
          ? "bad"
          : "muted";
  return <Badge tone={tone}>{OUTCOME_LABEL[outcome]}</Badge>;
}

export function CallStatusBadge({ status }: { status: Call["status"] }) {
  return status === "completed" ? (
    <Badge tone="good">Completed</Badge>
  ) : status === "failed" ? (
    <Badge tone="bad">Failed</Badge>
  ) : (
    <Badge tone="warn">In progress</Badge>
  );
}
