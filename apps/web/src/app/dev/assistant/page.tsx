import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, MonoLabel } from "@/components/ui";

const SECTIONS: Array<{ title: string; links: Array<[label: string, href: string]> }> = [
  {
    title: "Settings",
    links: [
      ["Owner, Standard plan", "/dev/assistant/settings"],
      ["Front desk (read-only)", "/dev/assistant/settings?role=front_desk"],
      ["Pilot plan, Upgrade available", "/dev/assistant/settings?plan=pilot"],
      ["Pilot plan, billing off", "/dev/assistant/settings?plan=pilot&billing=off"],
      ["Plan failed to load", "/dev/assistant/settings?usage=error"],
      ["Nothing set up yet", "/dev/assistant/settings?empty=1"],
      ["Editing clinic details", "/dev/assistant/settings?open=clinic"],
      ["Editing services", "/dev/assistant/settings?open=services"],
      ["Editing booking rules", "/dev/assistant/settings?open=rules"],
      ["Doctor drawer", "/dev/assistant/settings?open=doctor"],
      ["Add a doctor", "/dev/assistant/settings?open=new-doctor"],
    ],
  },
  {
    title: "Assistant",
    links: [
      ["Configure (owner)", "/dev/assistant/configure"],
      ["Front desk (read-only)", "/dev/assistant/configure?role=front_desk"],
      ["Unsaved changes", "/dev/assistant/configure?state=dirty"],
      ["Voice preview playing", "/dev/assistant/configure?state=playing"],
      ["Voice preview unavailable", "/dev/assistant/configure?state=preview-error"],
      ["Kannada greeting", "/dev/assistant/configure?state=kannada"],
      ["No profile yet", "/dev/assistant/configure?state=empty"],
    ],
  },
  {
    title: "Try your assistant",
    links: [
      ["Ready", "/dev/assistant/try"],
      ["Scripted call (press Start)", "/dev/assistant/try?state=play"],
      ["Connecting", "/dev/assistant/try?state=connecting"],
      ["Connected", "/dev/assistant/try?state=connected"],
      ["Listening", "/dev/assistant/try?state=listening"],
      ["Thinking", "/dev/assistant/try?state=thinking"],
      ["Speaking", "/dev/assistant/try?state=speaking"],
      ["Appointment booked", "/dev/assistant/try?state=booked"],
      ["Call ended", "/dev/assistant/try?state=ended"],
      ["Plan minutes binding", "/dev/assistant/try?state=plan"],
      ["Connection lost", "/dev/assistant/try?state=lost"],
      ["Microphone blocked", "/dev/assistant/try?state=error-mic"],
      ["Session expired", "/dev/assistant/try?state=error-session"],
      ["Lines busy (4029)", "/dev/assistant/try?state=error-busy"],
      ["Minutes used up", "/dev/assistant/try?state=error-minutes"],
      ["Voice service trouble", "/dev/assistant/try?state=error-voice"],
      ["Could not start", "/dev/assistant/try?state=error-start"],
      ["Misconfigured deployment", "/dev/assistant/try?state=error-config"],
      ["Sign-in service unreachable", "/dev/assistant/try?state=error-network"],
    ],
  },
];

/** /dev/assistant — preview routes for Settings, Assistant and Try your assistant. */
export default function AssistantPreviews() {
  return (
    <div className="min-h-screen px-[16px] py-[48px] sm:px-[32px]">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-[28px]">
        <header className="flex flex-col gap-[8px]">
          <Link href="/dev" className="text-muted hover:text-ink text-[13.5px] font-medium">
            ← Dev preview
          </Link>
          <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">
            Settings and assistant
          </h1>
        </header>
        <div className="grid items-start gap-[12px] md:grid-cols-3">
          {SECTIONS.map((s) => (
            <Card key={s.title} radius={18} className="flex flex-col gap-[10px] p-[20px]">
              <MonoLabel as="h2" className="m-0">
                {s.title}
              </MonoLabel>
              <ul className="m-0 flex list-none flex-col p-0">
                {s.links.map(([label, href]) => (
                  <li key={href} className="border-line-soft border-t first:border-t-0">
                    <Link
                      href={href}
                      className="text-ink-2 hover:text-teal-ink flex items-center justify-between gap-[12px] py-[9px] text-[14px]"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-2 truncate font-mono text-[11.5px]">
                          {href}
                        </span>
                      </span>
                      <ArrowUpRight size={13} className="text-muted-2 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
