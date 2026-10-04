import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { AmplifyProvider } from "@/components/auth/amplify-provider";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  style: ["normal", "italic"],
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://muxaris.com"),
  title: {
    default: "Muxaris | AI Voice Receptionist for Indian Dental Clinics",
    template: "%s | Muxaris",
  },
  description:
    "Muxaris answers every call to your clinic in Kannada, Hindi, Tamil, Telugu or English, books the appointment against your real calendar, and confirms it to the patient.",
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
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
