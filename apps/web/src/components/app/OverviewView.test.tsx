// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Appointment, Call, UsageSummary as Usage } from "@muxaris/shared";
import { OverviewView } from "./OverviewView";

afterEach(cleanup);

const NOW = new Date("2026-10-09T08:40:00Z"); // 2:10 pm IST

const call = {
  id: "c1",
  startedAt: "2026-10-09T08:22:00Z",
  channel: "phone",
  patientId: null,
  callerPhoneMasked: "+91 •••• ••3210",
  durationS: 78,
  languageDetected: "en-IN",
  outcome: "booked",
  status: "completed",
} as unknown as Call;

const stats = {
  date: "2026-10-09",
  callsToday: 7,
  bookedToday: 3,
  openCallbacks: 2,
  openUrgentCallbacks: 1,
  avgDurationS: 125,
  byOutcome: { booked: 3 },
};

const usage: Usage = {
  month: "2026-10",
  callSeconds: 600,
  calls: 2,
  llmInputTokens: 0,
  llmOutputTokens: 0,
  includedCallMinutes: 100,
  overageSeconds: 0,
  plan: "pilot",
  planName: "Pilot",
  priceInrMonthly: 0,
  maxConcurrentCalls: 2,
  pilotEndsAt: "2026-10-25T18:29:00.000Z",
};

const base = {
  clinicName: "Smile",
  tz: "Asia/Kolkata",
  now: NOW,
};

describe("OverviewView", () => {
  it("shows a per-section fallback when one fetch failed and renders the rest", () => {
    render(
      <OverviewView
        {...base}
        stats={{ ok: true, data: stats }}
        usage={{ ok: true, data: usage }}
        appointments={{ ok: true, data: { appointments: [], doctors: [], services: [] } }}
        recentCalls={{ ok: false }}
      />,
    );
    expect(screen.getByText(/Couldn't load recent calls/)).toBeTruthy();
    expect(screen.getByText(/No appointments today/)).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("/ 100")).toBeTruthy();
    expect(screen.getByText("Pilot ends 25 Oct 2026")).toBeTruthy();
    expect(screen.getByText("Fri, 9 Oct 2026")).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows the KPIs from the stats endpoint, the urgent count, and links open callbacks to the queue", () => {
    render(
      <OverviewView
        {...base}
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
    expect(within(link).getByText("1 urgent")).toBeTruthy();
    expect(within(link).getByText("View the callback queue")).toBeTruthy();
  });

  it("hides the urgent badge when nothing is urgent or the count is unknown", () => {
    const { rerender } = render(
      <OverviewView
        {...base}
        stats={{ ok: true, data: { ...stats, openUrgentCallbacks: 0 } }}
        usage={{ ok: true, data: usage }}
        appointments={{ ok: false }}
        recentCalls={{ ok: false }}
      />,
    );
    expect(screen.queryByText(/urgent/)).toBeNull();
    // An API that predates the count leaves it out.
    const older: Omit<typeof stats, "openUrgentCallbacks"> & { openUrgentCallbacks?: number } = {
      ...stats,
    };
    delete older.openUrgentCallbacks;
    rerender(
      <OverviewView
        {...base}
        stats={{ ok: true, data: older }}
        usage={{ ok: true, data: usage }}
        appointments={{ ok: false }}
        recentCalls={{ ok: false }}
      />,
    );
    expect(screen.queryByText(/urgent/)).toBeNull();
  });

  it("formats the average call length, short and unknown", () => {
    const { rerender } = render(
      <OverviewView
        {...base}
        stats={{ ok: true, data: { ...stats, avgDurationS: 41 } }}
        usage={{ ok: false }}
        appointments={{ ok: false }}
        recentCalls={{ ok: false }}
      />,
    );
    expect(screen.getByText("Average 41s")).toBeTruthy();
    rerender(
      <OverviewView
        {...base}
        stats={{ ok: true, data: { ...stats, avgDurationS: null } }}
        usage={{ ok: false }}
        appointments={{ ok: false }}
        recentCalls={{ ok: false }}
      />,
    );
    expect(screen.getByText("Average -")).toBeTruthy();
  });

  it("falls back on KPIs and appointments independently, and masks caller phones", () => {
    render(
      <OverviewView
        {...base}
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
    expect(within(recent).getByText("Today, 1:52 pm · 1m 18s · English")).toBeTruthy();
    expect(within(recent).getByText("Booked")).toBeTruthy();
    expect(screen.queryByText(/9876543210/)).toBeNull();
  });

  it("names known patients and labels browser calls as test calls", () => {
    const named = { ...call, id: "c2", patientId: "p1", patientName: "Priya Venkatesh" } as Call;
    const test = { ...call, id: "c3", channel: "browser", callerPhoneMasked: null } as Call;
    render(
      <OverviewView
        {...base}
        stats={{ ok: false }}
        usage={{ ok: false }}
        appointments={{ ok: false }}
        recentCalls={{ ok: true, data: [named, test] }}
      />,
    );
    const recent = screen.getByLabelText("Recent calls", { selector: "section" });
    expect(within(recent).getByText("Priya Venkatesh")).toBeTruthy();
    expect(within(recent).getByText("Test call")).toBeTruthy();
    expect(within(recent).getAllByRole("link")[1]!.getAttribute("href")).toBe("/app/calls/c2");
  });

  it("lists today's appointments by doctor with the NOW marker", () => {
    const a = (id: string, at: string, status: Appointment["status"]) =>
      ({
        id,
        doctorId: "d1",
        serviceId: "s1",
        startsAt: at,
        endsAt: at,
        status,
        patient: { name: "Asha", phoneMasked: "+91 •••• ••3210" },
      }) as unknown as Appointment;
    render(
      <OverviewView
        {...base}
        stats={{ ok: false }}
        usage={{ ok: false }}
        recentCalls={{ ok: false }}
        appointments={{
          ok: true,
          data: {
            appointments: [
              a("a1", "2026-10-09T04:30:00Z", "completed"),
              a("a2", "2026-10-09T09:00:00Z", "confirmed"),
            ],
            doctors: [{ id: "d1", name: "Dr. Meera Rao", color: "#0e9a96" }] as never,
            services: [{ id: "s1", name: "Filling" }] as never,
          },
        }}
      />,
    );
    const today = screen.getByLabelText("Today's appointments", { selector: "section" });
    expect(within(today).getByRole("heading", { name: "Dr. Meera Rao" })).toBeTruthy();
    expect(within(today).getByText("NOW · 2:10 PM")).toBeTruthy();
    expect(within(today).getByText("10:00 am")).toBeTruthy();
    expect(within(today).getByText("2:30 pm")).toBeTruthy();
  });

  it("stacks the KPI tiles one per row on phones and two on tablets, and shrinks the title", () => {
    render(
      <OverviewView
        {...base}
        stats={{ ok: true, data: stats }}
        usage={{ ok: true, data: usage }}
        appointments={{ ok: true, data: { appointments: [], doctors: [], services: [] } }}
        recentCalls={{ ok: false }}
      />,
    );
    const kpis = screen.getByRole("region", { name: "Key numbers" }).className;
    expect(kpis).toContain("grid-cols-1");
    expect(kpis).toContain("sm:grid-cols-2");
    // Desktop keeps the design's auto-fit grid.
    expect(kpis).toContain("lg:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]");
    const header = screen.getByRole("heading", { level: 1 }).closest("div")!.parentElement!;
    expect(header.className).toContain("max-lg:[&_h1]:text-[22px]");
  });
});
