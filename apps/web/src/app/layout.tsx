import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL("https://muxaris.com"),
  title: {
    default: "Muxaris | AI Voice Receptionist for Indian Dental Clinics",
    template: "%s | Muxaris",
  },
  description:
    "Muxaris answers every call to your clinic in Kannada, Hindi, Tamil, Telugu or English, books the appointment against your real calendar, and confirms it to the patient.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
