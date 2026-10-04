"use client";

import "./globals.css";
import { ErrorPanel, type ErrorBoundaryProps } from "@/components/errors/ErrorPanel";

/** Last resort: replaces the root layout, so it renders its own <html> and <body>. */
export default function GlobalError(props: ErrorBoundaryProps) {
  return (
    <html lang="en">
      <body>
        <ErrorPanel {...props} />
      </body>
    </html>
  );
}
