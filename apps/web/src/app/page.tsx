import type { Metadata } from "next";
import { Landing } from "@/components/marketing/Landing";
import { CONTACT_EMAIL, HERO, PLANS, SITE_URL } from "@/lib/content";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Muxaris",
      url: SITE_URL,
      logo: `${SITE_URL}/brand/muxaris-mark.png`,
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
    <Landing>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </Landing>
  );
}
