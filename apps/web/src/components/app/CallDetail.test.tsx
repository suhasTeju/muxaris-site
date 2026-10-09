// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Call, CallTurn, Callback } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CallDetail } from "./CallDetail";

afterEach(() => {
  cleanup();
  api.mockReset();
});

const TZ = "Asia/Kolkata";
const call = (over: Partial<Call> = {}) =>
  ({
    id: "c1",
    channel: "phone",
    callerPhoneMasked: "+91 •••• ••3210",
    patientId: "p1",
    languageDetected: "en-IN",
    startedAt: "2026-10-08T14:44:00.000Z",
    endedAt: "2026-10-08T14:44:21.000Z",
    durationS: 21,
    status: "completed",
    outcome: "booked",
    outcomeSource: "worker",
    recordingStatus: "none",
    summary: "Booked a consultation.",
    sentiment: "positive",
    metrics: {},
    analysis: { entities: {}, needsCallback: false },
    analysedAt: "2026-10-08T14:45:00.000Z",
    ...over,
  }) as unknown as Call;

const turns = [
  {
    id: "t1",
    seq: 1,
    role: "user",
    text: "Can I see the doctor tomorrow?",
    toolName: null,
    startedAt: "2026-10-08T14:44:00.000Z",
  },
] as unknown as CallTurn[];

const cb = {
  id: "cb1",
  callId: "c1",
  phoneMasked: "+91 •••• ••4821",
  reason: "Severe pain since the morning.",
  status: "open",
} as unknown as Callback;

describe("CallDetail", () => {
  it("titles the page with the call's date and time and lists its facts", () => {
    render(
      <CallDetail initialCall={call()} turns={turns} callbacks={[]} tz={TZ} patientName="Ananya" />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Thu, 8 Oct 2026, 8:14 pm");
    const meta = screen.getByRole("heading", { level: 1 }).nextElementSibling!;
    expect(meta.textContent).toBe("BookedCompleted0m 21sEnglishPhoneAnanya · +91 •••• ••3210");
    expect(screen.getByText("Click a line to jump to it")).toBeTruthy();
    expect(screen.queryByText("Edited by staff")).toBeNull();
    expect(
      screen.getByText(
        "Phone call · ended Thu, 8 Oct, 8:14 pm · outcome set from the call analysis",
      ),
    ).toBeTruthy();
  });

  it("marks a staff-edited outcome and names browser test calls", () => {
    render(
      <CallDetail
        initialCall={call({ outcomeSource: "staff", channel: "browser", callerPhoneMasked: null })}
        turns={[]}
        callbacks={[]}
        tz={TZ}
      />,
    );
    expect(screen.getByText("Edited by staff")).toBeTruthy();
    expect(screen.getByText("Browser")).toBeTruthy();
    expect(screen.getByText("Test call")).toBeTruthy();
    expect(screen.getByText("No transcript was recorded for this call.")).toBeTruthy();
    expect(screen.queryByText("Click a line to jump to it")).toBeNull();
  });

  it("says the transcript was deleted once the call is purged, and hides the player", () => {
    render(
      <CallDetail
        initialCall={call({ metrics: { purgedAt: 1 }, recordingStatus: "ready" } as Partial<Call>)}
        turns={turns}
        callbacks={[]}
        tz={TZ}
      />,
    );
    expect(
      screen.getAllByText("This call's transcript and summary were deleted after 90 days."),
    ).toHaveLength(2);
    expect(screen.queryByText("Can I see the doctor tomorrow?")).toBeNull();
    expect(screen.queryByLabelText("Call recording")).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });

  it("lists callbacks from this call with a link to the queue", () => {
    render(
      <CallDetail
        initialCall={call({ analysis: { entities: {}, needsCallback: true } } as Partial<Call>)}
        turns={turns}
        callbacks={[cb]}
        tz={TZ}
      />,
    );
    expect(screen.getByRole("heading", { name: "Callbacks from this call" })).toBeTruthy();
    expect(screen.getByText("+91 •••• ••4821")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("Callback requested: Severe pain since the morning.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open callback queue/ }).getAttribute("href")).toBe(
      "/app/callbacks",
    );
  });
});
