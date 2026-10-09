import type { Metadata } from "next";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Pricing } from "@/components/marketing/Pricing";
import { Eyebrow, PAGE_H1, SECTION_X } from "@/components/marketing/SectionHeader";
import { Shell } from "@/components/marketing/Shell";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start with a free 30-day pilot, then ₹4,999 per month for up to 3,000 call-minutes and unlimited bookings.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <Shell>
      <section
        className={`relative overflow-hidden pt-[120px] pb-[8px] lg:pt-[168px] ${SECTION_X}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(40% 70% at 50% 0%,rgba(14,154,150,0.14),transparent 70%)",
          }}
        />
        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-[18px] text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className={PAGE_H1}>
            Simple pricing. <span className="text-teal">Start free.</span>
          </h1>
        </div>
      </section>
      <Pricing heading={false} />
      <FinalCta />
    </Shell>
  );
}
