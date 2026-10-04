// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Call } from "@muxaris/shared";
import { OverviewView } from "./OverviewView";

afterEach(cleanup);

const call = {
  id: "c1",
  startedAt: new Date().toISOString(),
  channel: "phone",
  callerPhone: "+919876543210",
  durationS: 60,
  languageDetected: "en-IN",
  outcome: "booked",
  status: "completed",
} as unknown as Call;

const stats = {
  date: "2026-10-06",
  callsToday: 7,
  bookedToday: 3,
  openCallbacks: 2,
  avgDurationS: 125,
  byOutcome: { booked: 3 },
};

const usage = {
  month: "2026-10",
  callSeconds: 600,
  calls: 2,
  includedCallMinutes: 100,
  plan: "pilot",
};

describe("OverviewView", () => {
  it("shows a per-section fallback when one fetch failed and renders the rest", () => {
    render(
      <OverviewView
        clinicName="Smile"
        tz="Asia/Kolkata"
        stats={{ ok: true, data: stats }}
        usage={{ ok: true, data: usage }}
        appointments={{
          ok: true,
          data: { appointments: [], doctors: [], services: [] },
        }}
        recentCalls={{ ok: false }}
      />,
    );
    expect(screen.getByText(/Couldn't load recent calls/)).toBeTruthy();
    expect(screen.getByText(/No appointments today/)).toBeTruthy();
    expect(screen.getByText("10 / 100")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows the KPIs from the stats endpoint and links open callbacks to the queue", () => {
    render(
      <OverviewView
        clinicName="Smile"
        tz="Asia/Kolkata"
        stats={{ ok: true, data: stats }}
        usage={{ ok: true, data: usage }}
        appointments={{ ok: false }}
        recentCalls={{ ok: false }}
      />,
    );
    const kpis = screen.getByLabelText("Key numbers", { selector: "section" });
    expect(within(kpis).getByText("Calls today").nextSibling?.textContent).toBe("7");
    expect(within(kpis).getByText("Booked by assistant").nextSibling?.textContent).toBe("3");
    expect(within(kpis).getByText("Average 2m 05s")).toBeTruthy();
    const link = within(kpis).getByRole("link", { name: /Open callbacks/ });
    expect(link.getAttribute("href")).toBe("/app/callbacks");
    expect(within(link).getByText("2")).toBeTruthy();
  });

  it("falls back on KPIs and appointments independently, and masks caller phones", () => {
    render(
      <OverviewView
        clinicName="Smile"
        tz="Asia/Kolkata"
        stats={{ ok: false }}
        usage={{ ok: false }}
        appointments={{ ok: false }}
        recentCalls={{ ok: true, data: [call] }}
      />,
    );
    expect(screen.getByText(/Couldn't load today's appointments/)).toBeTruthy();
    expect(screen.getAllByText("Couldn't load")).toHaveLength(4);
    const recent = screen.getByLabelText("Recent calls", { selector: "section" });
    expect(within(recent).getByText("+91 •••• ••3210")).toBeTruthy();
    expect(screen.queryByText(/9876543210/)).toBeNull();
  });
});
