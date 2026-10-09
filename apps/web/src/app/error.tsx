"use client";

import { ErrorPanel, type ErrorBoundaryProps } from "@/components/errors/ErrorPanel";

export default function RootError(props: ErrorBoundaryProps) {
  return <ErrorPanel {...props} fullScreen />;
}
