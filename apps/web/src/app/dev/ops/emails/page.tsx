import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  LANGUAGE_CODES,
  LANGUAGES,
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_LABEL,
  type LanguageCode,
  type NotificationKind,
} from "@muxaris/shared";
// The web app does not depend on @muxaris/core (it would pull in the database client); this
// development-only gallery imports the one self-contained template module directly instead.
import {
  formatWhen,
  renderNotification,
} from "../../../../../../../packages/core/src/notifications/templates";
import { EmailFrame } from "./EmailFrame";

/** Caption dot per kind, from the design. */
const ACCENT: Record<NotificationKind, string> = {
  appointment_confirmed: "#16a34a",
  appointment_rescheduled: "#d98a14",
  appointment_cancelled: "#e04870",
  reminder_24h: "#0e9a96",
  reminder_2h: "#0e9a96",
};

/**
 * /dev/ops/emails: the five patient emails as the notifier sends them (the real HTML from
 * packages/core templates), with the design's demo values. `?lang=hi-IN|kn-IN|ta-IN|te-IN`.
 */
export default async function EmailsPreview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const lang: LanguageCode =
    LANGUAGE_CODES.find((c) => c === q["lang"]) ?? ("en-IN" satisfies LanguageCode);
  const label = LANGUAGES.find((l) => l.code === lang)?.label ?? lang;
  const startsAt = new Date("2026-10-09T11:00:00Z"); // Fri 9 Oct 2026, 4:30 pm IST
  const timezone = "Asia/Kolkata";
  const emails = NOTIFICATION_KINDS.map((kind) => ({
    kind,
    ...renderNotification(kind, lang, {
      patientName: "Ananya Krishnan",
      clinicName: "Sunrise Dental Care",
      doctorName: "Dr. Meera Rao",
      serviceName: "Consultation",
      when: formatWhen(startsAt, timezone, lang),
      clinicPhone: "+918041234567",
      startsAt,
      timezone,
      clinicAddress: "41, 9th Block, Jayanagar, Bengaluru",
      clinicCity: "Bengaluru",
    }),
  }));
  const row = "flex gap-[8px]";
  const key = "text-muted w-[56px] shrink-0";
  return (
    <div className="text-ink min-h-screen bg-[#e9eef3] leading-[normal]">
      <div className="mx-auto flex max-w-[1340px] flex-col gap-[24px] px-[16px] pt-[28px] pb-[48px] lg:gap-[36px] lg:px-[32px] lg:pt-[48px] lg:pb-[80px]">
        <div className="flex flex-wrap items-end justify-between gap-[24px]">
          <div className="flex max-w-[640px] flex-col gap-[8px]">
            <span className="text-teal-ink font-mono text-[12px] tracking-[0.12em] uppercase">
              Patient emails · {label}
            </span>
            <h1 className="m-0 text-[36px] leading-[1.1] font-semibold tracking-[-0.035em] max-sm:text-[28px]">
              Confirmations and reminders
            </h1>
            <p className="text-ink-3 m-0 text-[15px] leading-[1.55]">
              Sent from the clinic’s configured sender, in the patient’s preferred language. Dates
              read in the clinic’s timezone.
            </p>
          </div>
          <Link
            href="/dev/ops/notifications"
            className="border-field bg-surface text-ink hover:bg-paper hover:text-ink inline-flex h-[38px] items-center gap-[8px] rounded-10 border px-[14px] text-[14px] font-medium"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to Notifications
          </Link>
        </div>
        <div className="grid grid-cols-1 items-start gap-[24px] lg:grid-cols-[repeat(auto-fill,minmax(600px,1fr))] lg:gap-[32px]">
          {emails.map((m) => (
            <figure key={m.kind} className="m-0 flex flex-col gap-[12px]">
              <figcaption className="text-ink-3 flex items-center gap-[10px] font-mono text-[12px] tracking-[0.06em] uppercase">
                <span className="size-[8px] rounded-full" style={{ background: ACCENT[m.kind] }} />
                {NOTIFICATION_KIND_LABEL[m.kind]}
              </figcaption>
              <div className="bg-surface overflow-hidden rounded-14 border border-[#d9e0e8] shadow-[0_24px_50px_-30px_rgba(12,18,32,0.35)]">
                <div className="border-line bg-subtle flex flex-col gap-[4px] border-b px-[20px] py-[14px] text-[13px]">
                  <div className={row}>
                    <span className={key}>From</span>
                    <span className="shrink-0 font-semibold">Sunrise Dental Care</span>
                    <span className="text-muted min-w-0 truncate">
                      &lt;appointments@sunrisedental.in&gt;
                    </span>
                  </div>
                  <div className={row}>
                    <span className={key}>To</span>
                    <span>ananya.k@gmail.com</span>
                  </div>
                  <div className={row}>
                    <span className={key}>Subject</span>
                    <span className="min-w-0 font-semibold">{m.subject}</span>
                  </div>
                </div>
                <EmailFrame html={m.html} title={m.subject} />
              </div>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
