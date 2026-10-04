import type { Metadata } from "next";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Shell } from "@/components/marketing/Shell";
import { FAQS } from "@/lib/content";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Languages, accents, emergencies, data residency, booking and pricing: answers to what clinics ask first.",
  alternates: { canonical: "/faq" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <Shell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto max-w-3xl px-4 pt-16 sm:px-6 lg:pt-24">
        <h1 className="font-display text-5xl leading-[1.02] font-medium tracking-[-0.035em] sm:text-6xl">
          Frequently asked <span className="text-muted italic">questions.</span>
        </h1>
      </div>
      <Faq heading={false} />
      <FinalCta />
    </Shell>
  );
}
