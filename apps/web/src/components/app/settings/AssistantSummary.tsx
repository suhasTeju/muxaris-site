import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AssistantProfile } from "@muxaris/shared";
import { formatPhone } from "./format";
import { DefList, SectionEmpty, SettingsSection } from "./settings-ui";

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Settings → Assistant: a read-only summary; changes happen on the Assistant page. */
export function AssistantSummary({
  assistant,
  recordCalls,
}: {
  assistant: AssistantProfile | null;
  recordCalls: boolean;
}) {
  const record: [string, string] = ["Record calls", recordCalls ? "On" : "Off"];
  return (
    <SettingsSection
      id="set-assistant"
      title="Assistant"
      aside={
        <Link
          href="/app/assistant"
          className="inline-flex items-center gap-[6px] text-[13px] font-medium"
        >
          Open assistant settings
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      }
    >
      {assistant ? (
        <DefList
          rows={[
            ["Name", assistant.name],
            ["Tone", cap(assistant.tone)],
            ["Hand-off number", formatPhone(assistant.handoffNumber) || "Not set"],
            ["FAQ entries", String(assistant.faq.length)],
            record,
          ]}
        />
      ) : (
        <>
          <SectionEmpty>Assistant not set up yet.</SectionEmpty>
          <DefList rows={[record]} />
        </>
      )}
    </SettingsSection>
  );
}
