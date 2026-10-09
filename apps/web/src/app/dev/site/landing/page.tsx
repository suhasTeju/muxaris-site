import { DEMO_MESSAGES, FIELD_HINTS, checkMessage } from "@/components/marketing/demo-request";
import type { DemoFormState } from "@/components/marketing/demo-request";
import { Landing } from "@/components/marketing/Landing";

/** The prototype's `demoState` and `signedIn` props, as query states. */
const STATES: Record<string, { signedIn?: boolean; demoState?: DemoFormState }> = {
  signedin: { signedIn: true },
  "demo-error": { demoState: { status: "error", message: DEMO_MESSAGES.server } },
  "demo-invalid": {
    demoState: {
      status: "error",
      message: checkMessage(["name", "phone", "email"]),
      errors: { name: "Enter your name.", phone: FIELD_HINTS.phone!, email: FIELD_HINTS.email! },
    },
  },
  "demo-success": { demoState: { status: "done", message: DEMO_MESSAGES.sent } },
};

/**
 * /dev/site/landing[?state=signedin|demo-error|demo-invalid|demo-success][&t=19.6|live]
 * The sample call is frozen at 19.6 s by default (the reference render's moment); `t=live`
 * replays it silently as on the real page.
 */
export default async function LandingPreview({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; t?: string }>;
}) {
  const { state = "", t } = await searchParams;
  const pick = STATES[state] ?? {};
  const demoTime = t === "live" ? undefined : Number.isFinite(Number(t)) && t ? Number(t) : 19.6;
  return <Landing signedIn={pick.signedIn} demoState={pick.demoState} demoTime={demoTime} />;
}
