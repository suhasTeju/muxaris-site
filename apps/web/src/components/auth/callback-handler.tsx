"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Hub } from "aws-amplify/utils";
import { fetchAuthSession } from "aws-amplify/auth";
import { safeNext } from "@/lib/auth-errors";
import { pendingNext } from "@/lib/client-store";

/** The Amplify hooks the OAuth callback waits on; previews pass stubs. */
export interface CallbackAuth {
  /** Subscribes to Amplify auth events; returns the unsubscribe function. */
  listen: (onEvent: (event: string) => void) => () => void;
  /** Resolves true when a session with an access token already exists. */
  hasSession: () => Promise<boolean>;
}

const AMPLIFY: CallbackAuth = {
  listen: (onEvent) => Hub.listen("auth", ({ payload }) => onEvent(payload.event)),
  hasSession: () => fetchAuthSession().then((s) => Boolean(s.tokens?.accessToken)),
};

export function CallbackHandler({ auth = AMPLIFY }: { auth?: CallbackAuth }) {
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(Boolean(params.get("error")));

  useEffect(() => {
    if (failed) return;
    let finished = false;
    const go = () => {
      if (finished) return;
      finished = true;
      router.replace(safeNext(pendingNext.take() ?? params.get("next")));
      router.refresh();
    };
    const stop = auth.listen((event) => {
      if (event === "signInWithRedirect") go();
      if (event === "signInWithRedirect_failure") {
        finished = true;
        setFailed(true);
      }
    });
    auth
      .hasSession()
      .then((ok) => {
        if (ok) go();
      })
      .catch(() => undefined);
    return stop;
  }, [failed, params, router, auth]);

  if (failed) {
    return (
      <p role="alert" className="text-ink-2 m-0 text-[15px] leading-[1.6]">
        We couldn’t complete Google sign-in. Please try again.{" "}
        <Link href="/sign-in" className="font-semibold">
          Back to sign in
        </Link>
      </p>
    );
  }
  return (
    <div
      role="status"
      className="border-line bg-subtle flex items-center gap-[14px] rounded-16 border p-[18px]"
    >
      <span
        aria-hidden="true"
        className="border-teal-line border-t-teal animate-mx-spin size-[22px] flex-none rounded-full border-[2.5px] motion-reduce:animate-none"
      />
      <span className="text-ink-2 text-[15px]">Signing you in…</span>
    </div>
  );
}
