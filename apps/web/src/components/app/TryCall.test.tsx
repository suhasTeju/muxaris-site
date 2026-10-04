// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  opts: [] as Array<{ token: string; language: string; clinicId: string; url: string }>,
}));
const start = vi.fn(async () => undefined);
const stop = vi.fn();

vi.mock("@muxaris/voice-sdk", () => ({
  useVoiceCall: (o: (typeof hook.opts)[number]) => {
    hook.opts.push(o);
    return { start, stop, ...hook.value };
  },
}));
vi.mock("./clinic-context", () => ({
  useClinic: () => ({ activeClinic: { id: "clinic_1", name: "Smile", role: "owner" } }),
}));
vi.mock("./use-clinic-profile", () => ({
  useClinicProfile: () => ({
    tz: "Asia/Kolkata",
    clinic: { languages: ["en-IN", "kn-IN"], timezone: "Asia/Kolkata" },
  }),
}));
const getAccessToken = vi.fn(async () => "tok-fresh");
const assertEnv = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({
  env: { voiceWsUrl: "wss://v.test" },
  assertRuntimeEnv: () => assertEnv(),
}));
vi.mock("@/lib/api-client", () => ({ getAccessToken: () => getAccessToken() }));

import { TryCall } from "./TryCall";

const base = {
  phase: "idle",
  state: null,
  lines: [],
  tools: [],
  booking: null,
  secondsRemaining: null,
  planSecondsRemaining: null,
  error: null,
};

beforeEach(() => {
  hook.value = { ...base };
  hook.opts = [];
  start.mockClear();
  stop.mockClear();
  getAccessToken.mockClear();
  assertEnv.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("TryCall", () => {
  it("offers only the clinic's languages and shows microphone guidance when idle", () => {
    render(<TryCall />);
    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["en-IN", "kn-IN"]);
    expect(screen.getByText(/microphone access/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start call" })).toBeTruthy();
  });

  it("shows the plan quota line only when the plan is the binding limit", () => {
    hook.value = {
      ...base,
      phase: "live",
      state: "listening",
      secondsRemaining: 90,
      planSecondsRemaining: 90,
    };
    render(<TryCall />);
    expect(screen.getByText("1:30 left in this call")).toBeTruthy();
    expect(screen.getByText("Your plan has 1:30 of call time left this month")).toBeTruthy();
  });

  it("fetches a fresh token on Start, then starts the call with it", async () => {
    render(<TryCall />);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "kn-IN" } });
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const last = hook.opts.at(-1)!;
    expect(last).toMatchObject({ token: "tok-fresh", language: "kn-IN", clinicId: "clinic_1" });
    expect(last.url).toMatch(/\/v1\/session$/);
  });

  it("renders transcript, state label, tool timeline, remaining time and booking card while live", () => {
    hook.value = {
      ...base,
      phase: "live",
      state: "thinking",
      secondsRemaining: 125,
      lines: [
        { role: "user", text: "I need a cleaning" },
        { role: "assistant", text: "Sure, let me check." },
      ],
      tools: [
        { name: "check_availability", status: "done", summary: "Checked Dr. Rao's slots" },
        { name: "book_appointment", status: "started", summary: "Booking your appointment…" },
      ],
      booking: {
        appointmentId: "a1",
        doctorName: "Dr. Rao",
        serviceName: "Cleaning",
        startsAt: "2026-10-06T04:00:00Z",
      },
    };
    render(<TryCall />);
    expect(screen.getByTestId("state-label").textContent).toBe("Thinking");
    const transcript = screen.getByRole("region", { name: "Transcript" });
    const items = within(transcript).getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("data-role"))).toEqual(["user", "assistant"]);
    expect(within(transcript).getByText("I need a cleaning")).toBeTruthy();
    const tools = screen.getByRole("region", { name: "Assistant actions" });
    expect(within(tools).getByText("Checked Dr. Rao's slots")).toBeTruthy();
    expect(
      within(tools)
        .getAllByRole("listitem")
        .map((i) => i.getAttribute("data-status")),
    ).toEqual(["done", "started"]);
    expect(screen.getByText("2:05 left in this call")).toBeTruthy();
    expect(screen.queryByText(/Your plan has/)).toBeNull();
    const card = screen.getByRole("region", { name: "Appointment booked" });
    expect(within(card).getByText(/Dr\. Rao · Tue, 6 Oct, 9:30 am/)).toBeTruthy();
    expect(
      within(card).getByRole("link", { name: "View in appointments" }).getAttribute("href"),
    ).toBe("/app/appointments");
    fireEvent.click(screen.getByRole("button", { name: "End call" }));
    expect(stop).toHaveBeenCalled();
  });

  it.each([
    ["invalid or expired token", "Your session expired"],
    ["too many concurrent calls", "All call lines are busy"],
    ["monthly call minutes exhausted", "Monthly call minutes used up"],
    ["Voice provider error", "The voice service is having trouble"],
    ["Permission denied", "Microphone is blocked"],
  ])("explains the %s error", (error, title) => {
    hook.value = { ...base, phase: "error", error };
    render(<TryCall />);
    expect(within(screen.getByRole("alert")).getByText(title)).toBeTruthy();
  });

  it("starts once when Start is double-clicked during the token fetch", async () => {
    let resolve!: (t: string) => void;
    getAccessToken.mockImplementationOnce(() => new Promise<string>((r) => (resolve = r)));
    render(<TryCall />);
    const btn = screen.getByRole("button", { name: "Start call" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    resolve("tok-fresh");
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("reports a network failure fetching the token separately from an expired session", async () => {
    getAccessToken.mockRejectedValueOnce(new Error("offline"));
    render(<TryCall />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Could not reach the sign-in service")).toBeTruthy();
    expect(screen.queryByText("Your session expired")).toBeNull();
    expect(start).not.toHaveBeenCalled();
    // The button is usable again.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Start call" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it("reports a missing session as expired", async () => {
    getAccessToken.mockResolvedValueOnce(undefined as unknown as string);
    render(<TryCall />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    expect(await screen.findByText("Your session expired")).toBeTruthy();
  });

  it("shows a misconfiguration error inline, before fetching a token", async () => {
    assertEnv.mockImplementation(() => {
      throw new Error("This deployment is misconfigured: NEXT_PUBLIC_VOICE_WS_URL is not set");
    });
    render(<TryCall />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/misconfigured/);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("classifies a failure by the SDK errorCode before its wording", () => {
    hook.value = { ...base, phase: "error", error: "something opaque", errorCode: "quota" };
    render(<TryCall />);
    expect(screen.getByRole("alert").textContent).toMatch(/Monthly call minutes used up/);
  });
});
