"use client";

import { ErrorPanel, type ErrorBoundaryProps } from "@/components/errors/ErrorPanel";

export default function AppError(props: ErrorBoundaryProps) {
  return <ErrorPanel {...props} signOut />;
}
