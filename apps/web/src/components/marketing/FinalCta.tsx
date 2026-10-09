import { CITIES, LANGUAGES, SPECIALTIES, SPECIALTY_LABELS } from "@muxaris/shared";
import { Clock } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { DemoForm } from "./DemoForm";
import type { DemoFormState } from "./demo-request";
import { ANCHOR, CONTAINER, SECTION_X, SECTION_Y, SectionHeader } from "./SectionHeader";

/** "Book a demo": the closing band on the home, pricing and FAQ pages. */
export function FinalCta({ initialState }: { initialState?: DemoFormState }) {
  return (
    <section
      id="demo"
      className={cn(
        "border-line relative overflow-hidden border-t bg-[linear-gradient(180deg,#e9eff3_0%,#f4f6f9_100%)]",
        SECTION_X,
        SECTION_Y,
        ANCHOR,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(45% 60% at 15% 20%,rgba(14,154,150,0.14),transparent 70%)",
        }}
      />
      <div
        className={`${CONTAINER} relative grid items-start gap-[40px] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-[72px]`}
      >
        <div className="flex flex-col gap-[22px] lg:pt-[12px]">
          <SectionHeader
            eyebrow="Book a demo"
            aside="answers."
            asideTone="teal"
            className="gap-[22px]"
          >
            Hear how it
          </SectionHeader>
          <p className="text-ink-3 m-0 text-[17px] leading-[1.6] text-pretty">
            Tell us about your clinic. We’ll set up a short walkthrough, and if you’re one of the
            first 10 Bengaluru clinics, a free 30-day pilot. Today the live product is a browser
            call; clinic phone numbers are coming soon.
          </p>
          <p className="text-teal-ink m-0 flex items-center gap-[10px] text-[15px] font-medium">
            <Clock size={16} aria-hidden className="shrink-0" />
            We reply within one working day.
          </p>
        </div>
        <div className="rounded-[28px] border border-white bg-[rgba(255,255,255,0.86)] p-[20px] shadow-[0_1px_2px_rgba(12,18,32,0.04),0_40px_80px_-40px_rgba(12,18,32,0.3)] backdrop-blur-[20px] sm:p-[32px]">
          <DemoForm
            cities={[...CITIES]}
            specialties={SPECIALTIES.map((s) => ({ value: s, label: SPECIALTY_LABELS[s] }))}
            languages={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            initialState={initialState}
          />
        </div>
      </div>
    </section>
  );
}
