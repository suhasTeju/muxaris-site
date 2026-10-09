import type { Metadata } from "next";
import {
  Fraunces,
  Geist_Mono,
  Noto_Sans_Devanagari,
  Noto_Sans_Kannada,
  Noto_Sans_Tamil,
  Noto_Sans_Telugu,
  Schibsted_Grotesk,
} from "next/font/google";
import "./globals.css";

// Type system from the design bundle: Schibsted Grotesk for UI and body, Geist Mono for
// figures and labels, Fraunces 600 only inside the wordmark, Noto Sans for the Indic scripts.
const schibsted = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-schibsted",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-fraunces",
  display: "swap",
});
// Indic faces load on demand (unicode-range), so they are not preloaded on every page.
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-devanagari",
  display: "swap",
  preload: false,
});
const notoKannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-kannada",
  display: "swap",
  preload: false,
});
const notoTamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-tamil",
  display: "swap",
  preload: false,
});
const notoTelugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-telugu",
  display: "swap",
  preload: false,
});

const fontVariables = [
  schibsted,
  geistMono,
  fraunces,
  notoDevanagari,
  notoKannada,
  notoTamil,
  notoTelugu,
]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  metadataBase: new URL("https://muxaris.com"),
  title: {
    default: "Muxaris | AI Voice Receptionist for Indian Dental Clinics",
    template: "%s | Muxaris",
  },
  description:
    "Muxaris answers every call to your clinic in Kannada, Hindi, Tamil, Telugu or English, and books the appointment against your real calendar.",
  openGraph: {
    type: "website",
    siteName: "Muxaris",
    locale: "en_IN",
    url: "https://muxaris.com",
    title: "Muxaris | AI Voice Receptionist for Indian Dental Clinics",
    description: "Your front desk misses calls. Muxaris doesn’t.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
