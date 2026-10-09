import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GREETINGS } from "@/lib/content";
import { SamplePlayer } from "./SamplePlayer";
import { ANCHOR, CONTAINER, SECTION_X, SECTION_Y, SectionHeader } from "./SectionHeader";

export function Languages() {
  return (
    <section
      id="languages"
      className={cn("border-line bg-surface border-t", SECTION_X, SECTION_Y, ANCHOR)}
    >
      <div
        className={`${CONTAINER} grid items-start gap-[40px] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-[72px]`}
      >
        <div className="flex flex-col gap-[20px] lg:sticky lg:top-[120px]">
          <SectionHeader eyebrow="Languages">Greeted in the language they think in.</SectionHeader>
          <p className="text-muted m-0 text-[17px] leading-[1.6] text-pretty">
            Press play to hear the same clinic greeting in each language. These are the real clips
            Muxaris speaks, not mock-ups.
          </p>
          <p className="text-teal-ink m-0 flex items-center gap-[10px] text-[15px] font-medium">
            <ArrowLeftRight size={16} aria-hidden className="shrink-0" />
            Callers can switch mid-call; Muxaris follows.
          </p>
        </div>
        <ul className="border-line bg-subtle m-0 flex list-none flex-col overflow-hidden rounded-[26px] border p-0">
          {GREETINGS.map((g, i) => (
            <SamplePlayer key={g.code} greeting={g} index={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}
