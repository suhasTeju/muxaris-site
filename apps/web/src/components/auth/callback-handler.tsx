"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Hub } from "aws-amplify/utils";
import { fetchAuthSession } from "aws-amplify/auth";
import { authErrorMessage, safeNext } from "@/lib/auth-errors";

export function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(params.get("error_description"));

  useEffect(() => {
    if (error) return;
    const next = safeNext(params.get("next"));
    let finished = false;
    const go = () => {
      if (finished) return;
      finished = true;
      router.replace(next);
      router.refresh();
    };
    const stop = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") go();
      if (payload.event === "signInWithRedirect_failure") {
        finished = true;
        setError(authErrorMessage(payload.data ?? new Error("Google sign-in failed.")));
      }
    });
    // Already signed in (e.g. code exchanged before the listener attached).
    fetchAuthSession()
      .then((s) => {
        if (s.tokens?.accessToken) go();
      })
      .catch(() => undefined);
    return stop;
  }, [error, params, router]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
        {error}{" "}
        <a href="/sign-in" className="underline">
          Back to sign in
        </a>
      </p>
    );
  }
  return <p className="text-muted text-sm">Signing you in…</p>;
}
