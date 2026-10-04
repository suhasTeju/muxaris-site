"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Hub } from "aws-amplify/utils";
import { fetchAuthSession } from "aws-amplify/auth";
import { safeNext } from "@/lib/auth-errors";
import { pendingNext } from "@/lib/client-store";

const GENERIC_ERROR = "We couldn’t complete Google sign-in. Please try again.";

export function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(params.get("error") ? GENERIC_ERROR : null);

  useEffect(() => {
    if (error) return;
    let finished = false;
    const go = () => {
      if (finished) return;
      finished = true;
      router.replace(safeNext(pendingNext.take() ?? params.get("next")));
      router.refresh();
    };
    const stop = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") go();
      if (payload.event === "signInWithRedirect_failure") {
        finished = true;
        setError(GENERIC_ERROR);
      }
    });
    fetchAuthSession()
      .then((s) => {
        if (s.tokens?.accessToken) go();
      })
      .catch(() => undefined);
    return stop;
  }, [error, params, router]);

  if (error) {
    return (
      <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3.5 py-2.5 text-sm">
        {error}{" "}
        <Link href="/sign-in" className="underline">
          Back to sign in
        </Link>
      </p>
    );
  }
  return <p className="text-muted text-sm">Signing you in…</p>;
}
