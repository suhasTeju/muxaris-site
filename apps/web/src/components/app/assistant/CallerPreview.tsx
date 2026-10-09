import { PhoneCall, ShieldCheck } from "lucide-react";
import { ButtonLink, cn } from "@/components/ui";

const BAR = "w-[3px] rounded-[2px] bg-signal";

/** Assistant page aside: what callers hear first, and the way into a test call. */
export function CallerPreview({
  name,
  languageLabel,
  voiceLabel,
  greeting,
  playing,
}: {
  name: string;
  languageLabel: string;
  voiceLabel: string;
  greeting: string;
  playing: boolean;
}) {
  const anim = (delay: string) =>
    playing ? { animation: `mxBar .9s ease-in-out ${delay} infinite` } : undefined;
  return (
    <aside className="flex flex-col gap-[12px] lg:sticky lg:top-[84px]">
      <div className="relative flex flex-col gap-[16px] overflow-hidden rounded-20 border border-[#d5ece9] bg-[linear-gradient(160deg,#e6f5f4_0%,#f4f8fa_60%,#ffffff_100%)] p-[20px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-[60px] -right-[60px] size-[200px] rounded-full bg-[radial-gradient(circle,rgba(14,154,150,0.18),transparent_70%)]"
        />
        <span className="text-teal-ink relative font-mono text-[11px] tracking-[0.1em] uppercase">
          What callers hear first
        </span>
        <div className="relative flex items-center gap-[12px]">
          <span
            aria-hidden="true"
            className="bg-ink grid size-[44px] shrink-0 place-items-center rounded-14"
          >
            <span className="flex h-[18px] items-center gap-[3px]">
              <span className={cn(BAR, "h-[10px]")} style={anim("0s")} />
              <span className={cn(BAR, "h-[18px]")} style={anim(".15s")} />
              <span className={cn(BAR, "h-[12px]")} style={anim(".3s")} />
            </span>
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold">{name}</span>
            <span className="text-muted text-[12.5px]">
              {languageLabel} · {voiceLabel}
            </span>
          </div>
        </div>
        <p className="border-teal-line text-ink relative m-0 rounded-[16px_16px_16px_4px] border bg-[rgba(255,255,255,0.85)] px-[16px] py-[14px] text-[15.5px] leading-[1.55] break-words">
          {greeting.trim() ? greeting : "Write a greeting first."}
        </p>
        <div className="relative flex gap-[10px] border-t border-[rgba(14,154,150,0.18)] pt-[12px]">
          <ShieldCheck size={16} aria-hidden="true" className="text-teal-ink mt-[2px] shrink-0" />
          <span className="text-ink-2 text-[13px] leading-[1.5]">
            Every call opens with a short note that an AI assistant is answering and that the call
            may be recorded and transcribed.
          </span>
        </div>
      </div>
      <ButtonLink
        href="/app/assistant/try"
        size={44}
        icon={PhoneCall}
        iconSize={15}
        block
        className="text-[14px] font-semibold"
      >
        Try your assistant
      </ButtonLink>
    </aside>
  );
}
