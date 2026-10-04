"use client";

import { configureAmplify } from "@/lib/amplify";

configureAmplify();

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
