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

import { ToastProvider } from "@/components/ui";
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
  it("below 1024 stacks the call column above the conversation and the tool timeline", () => {
    render(<TryCall />);
    const call = screen.getByRole("button", { name: /Start call/ }).closest(".grid > *")!;
    const grid = call.parentElement!;
    expect(grid.className.split(" ")).toEqual(
      expect.arrayContaining(["grid-cols-1", "lg:grid-cols-[352px_minmax(0,1fr)]"]),
    );
    expect(grid.firstElementChild).toBe(call);
    const rest = grid.lastElementChild!;
    const conversation = within(rest as HTMLElement).getByText("Conversation");
    const tools = within(rest as HTMLElement).getByText("What the assistant is doing");
    expect(
      conversation.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers only the clinic's languages and shows microphone guidance when idle", () => {
    render(<TryCall />);
    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["en-IN", "kn-IN"]);
    // The design's default: Kannada when the clinic offers it.
    expect(select.value).toBe("kn-IN");
    expect(screen.getByTestId("state-label").textContent).toBe("Ready");
    expect(screen.getByText("Say hello. The conversation appears here.")).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "What the assistant is doing" })).getByText(
        "Checks, bookings and transfers show here as they happen.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/microphone access/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start call" })).toBeTruthy();
  });

  it("shows the plan's minutes instead of the call cap when the plan is the binding limit", () => {
    hook.value = {
      ...base,
      phase: "live",
      state: "listening",
      secondsRemaining: 90,
      planSecondsRemaining: 90,
    };
    render(<TryCall />);
    expect(screen.getByText("Your plan has 1:30 of call time left this month")).toBeTruthy();
    expect(screen.queryByText(/left in this call/)).toBeNull();
  });

  it("fetches a fresh token on Start, then starts the call with it", async () => {
    render(<TryCall />);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "en-IN" } });
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const last = hook.opts.at(-1)!;
    expect(last).toMatchObject({ token: "tok-fresh", language: "en-IN", clinicId: "clinic_1" });
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
        { name: "find_slots", status: "done", summary: "2 slots" },
        { name: "book_appointment", status: "started", summary: "" },
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
    const transcript = screen.getByRole("region", { name: "Conversation" });
    const items = within(transcript).getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("data-role"))).toEqual(["user", "assistant"]);
    expect(within(transcript).getByText("I need a cleaning")).toBeTruthy();
    const tools = screen.getByRole("region", { name: "What the assistant is doing" });
    expect(within(tools).getByText("2 slots")).toBeTruthy();
    expect(within(tools).getByText("Checking free slots")).toBeTruthy();
    expect(within(tools).getByText("Booking the slot")).toBeTruthy();
    expect(
      within(tools)
        .getAllByRole("listitem")
        .map((i) => i.getAttribute("data-status")),
    ).toEqual(["done", "started"]);
    expect(screen.getByText("2:05 left in this call")).toBeTruthy();
    expect(screen.queryByText(/Your plan has/)).toBeNull();
    expect(screen.queryByText(/microphone access/)).toBeNull();
    expect((screen.getByLabelText("Language") as HTMLSelectElement).disabled).toBe(true);
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

  it("an expired session offers Sign in again, keeps the microphone hint and offers Start call", () => {
    hook.value = { ...base, phase: "error", error: "invalid or expired token", errorCode: "auth" };
    render(<TryCall />);
    expect(
      within(screen.getByRole("alert"))
        .getByRole("link", { name: "Sign in again" })
        .getAttribute("href"),
    ).toBe("/sign-in?next=/app/assistant/try");
    expect(screen.getByText(/microphone access/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start call" })).toBeTruthy();
  });

  it("a dropped call reads Connection lost", () => {
    hook.value = {
      ...base,
      phase: "error",
      error: "Connection lost",
      errorCode: "network",
      lines: [{ role: "assistant", text: "Hello" }],
    };
    render(<TryCall />);
    expect(screen.getByTestId("state-label").textContent).toBe("Connection lost");
    expect(within(screen.getByRole("alert")).getByText("The call could not start")).toBeTruthy();
  });

  it("after a call ends it offers Start another call with a fresh token", async () => {
    const { rerender } = render(<TryCall />);
    fireEvent.click(screen.getByRole("button", { name: "Start call" }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    hook.value = { ...base, phase: "live", state: "speaking" };
    rerender(<TryCall />);
    hook.value = { ...base, phase: "ended" };
    rerender(<TryCall />);
    expect(hook.opts.at(-1)!.token).toBe("");
    expect(screen.getByTestId("state-label").textContent).toBe("Call ended");
    expect(screen.getByText("The conversation appears here.")).toBeTruthy();
    getAccessToken.mockResolvedValueOnce("tok-second");
    fireEvent.click(screen.getByRole("button", { name: "Start another call" }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(hook.opts.at(-1)!.token).toBe("tok-second");
  });

  it("announces a booking with a toast that links to the appointments", () => {
    hook.value = {
      ...base,
      phase: "live",
      state: "speaking",
      booking: {
        appointmentId: "a1",
        doctorName: "Dr. Rao",
        serviceName: "Cleaning",
        startsAt: "2026-10-06T04:00:00Z",
      },
    };
    render(
      <ToastProvider>
        <TryCall />
      </ToastProvider>,
    );
    const toast = screen
      .getAllByRole("status")
      .find((s) => s.textContent?.includes("Appointment booked by your assistant"));
    expect(toast).toBeTruthy();
    expect(within(toast!).getByRole("link", { name: "View" }).getAttribute("href")).toBe(
      "/app/appointments",
    );
  });

  it("classifies a failure by the SDK errorCode before its wording", () => {
    hook.value = { ...base, phase: "error", error: "something opaque", errorCode: "quota" };
    render(<TryCall />);
    expect(screen.getByRole("alert").textContent).toMatch(/Monthly call minutes used up/);
  });
});
