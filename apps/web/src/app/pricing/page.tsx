import type { Metadata } from "next";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Pricing } from "@/components/marketing/Pricing";
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
      <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 lg:pt-24">
        <h1 className="font-display max-w-3xl text-5xl leading-[1.02] font-medium tracking-[-0.035em] text-balance sm:text-6xl">
          Simple pricing. <span className="text-muted italic">Start free.</span>
        </h1>
      </div>
      <Pricing heading={false} />
      <FinalCta />
    </Shell>
  );
}
