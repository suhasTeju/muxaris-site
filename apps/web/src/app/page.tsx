import type { Metadata } from "next";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { LanguageMarquee } from "@/components/marketing/LanguageMarquee";
import { Languages } from "@/components/marketing/Languages";
import { LiveDemo } from "@/components/marketing/LiveDemo";
import { Pricing } from "@/components/marketing/Pricing";
import { ProblemStats } from "@/components/marketing/ProblemStats";
import { Shell } from "@/components/marketing/Shell";
import { WhatItHandles } from "@/components/marketing/WhatItHandles";
import { WhoItsFor } from "@/components/marketing/WhoItsFor";
import { CONTACT_EMAIL, HERO, PLANS, SITE_URL } from "@/lib/content";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Muxaris",
      url: SITE_URL,
      logo: `${SITE_URL}/brand/muxaris-mark.svg`,
      email: CONTACT_EMAIL,
      address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressCountry: "IN" },
    },
    {
      "@type": "SoftwareApplication",
      name: "Muxaris",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: HERO.sub,
      url: SITE_URL,
      offers: PLANS.map((p) => ({
        "@type": "Offer",
        name: p.name,
        price: p.price.replace(/[^0-9]/g, "").replace(/,/g, ""),
        priceCurrency: "INR",
      })),
    },
  ],
};

export default function Home() {
  return (
    <Shell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Hero />
      <LanguageMarquee />
      <ProblemStats />
      <LiveDemo />
      <HowItWorks />
      <Languages />
      <WhatItHandles />
      <WhoItsFor />
      <Pricing />
      <Faq />
      <FinalCta />
    </Shell>
  );
}
