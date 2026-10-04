"use client";

import { ErrorPanel, type ErrorBoundaryProps } from "@/components/errors/ErrorPanel";

export default function OnboardingError(props: ErrorBoundaryProps) {
  return <ErrorPanel {...props} signOut />;
}
