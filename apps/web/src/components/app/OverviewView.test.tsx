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
        todayCalls={{ ok: true, data: [call] }}
        usage={{ ok: true, data: usage }}
        appointments={{
          ok: true,
          data: { appointments: [], doctors: [], services: [], patients: [] },
        }}
        recentCalls={{ ok: false }}
      />,
    );
    expect(screen.getByText(/Couldn't load recent calls/)).toBeTruthy();
    expect(screen.getByText(/No appointments today/)).toBeTruthy();
    expect(screen.getByText("10 / 100")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("falls back on KPIs and appointments independently, and masks caller phones", () => {
    render(
      <OverviewView
        clinicName="Smile"
        tz="Asia/Kolkata"
        todayCalls={{ ok: false }}
        usage={{ ok: false }}
        appointments={{ ok: false }}
        recentCalls={{ ok: true, data: [call] }}
      />,
    );
    expect(screen.getByText(/Couldn't load today's appointments/)).toBeTruthy();
    expect(screen.getAllByText("Couldn't load")).toHaveLength(3);
    const recent = screen.getByLabelText("Recent calls", { selector: "section" });
    expect(within(recent).getByText("•••• 3210")).toBeTruthy();
    expect(screen.queryByText(/9876543210/)).toBeNull();
  });
});
