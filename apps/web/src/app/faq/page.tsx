import type { Metadata } from "next";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Eyebrow, PAGE_H1, SECTION_X } from "@/components/marketing/SectionHeader";
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
      <section className={`relative overflow-hidden pt-[120px] lg:pt-[168px] ${SECTION_X}`}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(40% 70% at 20% 0%,rgba(14,154,150,0.12),transparent 70%)",
          }}
        />
        <div className="relative mx-auto flex max-w-[1200px] flex-col gap-[18px]">
          <Eyebrow>FAQ</Eyebrow>
          <h1 className={PAGE_H1}>
            Frequently asked <span className="text-muted-2">questions.</span>
          </h1>
        </div>
      </section>
      <Faq heading={false} />
      <FinalCta />
    </Shell>
  );
}
