"use client";

import { Geist_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { ErrorPanel, type ErrorBoundaryProps } from "@/components/errors/ErrorPanel";

// The root layout (and its fonts) is gone here, so load the two faces the panel uses.
const schibsted = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

/** Last resort: replaces the root layout, so it renders its own <html> and <body>. */
export default function GlobalError(props: ErrorBoundaryProps) {
  return (
    <html lang="en" className={`${schibsted.variable} ${geistMono.variable}`}>
      <body>
        <ErrorPanel {...props} fullScreen />
      </body>
    </html>
  );
}
