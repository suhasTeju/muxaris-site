// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { DEFAULT_SPEAKER } from "@/lib/onboarding";

const h = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace, refresh: h.refresh }),
}));
vi.mock("@/lib/api-client", () => ({
  useApi: () => h.api,
  getAccessToken: vi.fn(),
}));

import { Wizard } from "./Wizard";

type Handler = (path: string, init?: { method?: string }) => unknown;
let calls: string[] = [];
function setApi(overrides: Record<string, Handler | unknown> = {}) {
  calls = [];
  h.api.mockImplementation(async (path: string, init?: { method?: string }) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push(key);
    if (key in overrides) {
      const o = overrides[key];
      return typeof o === "function" ? (o as Handler)(path, init) : o;
    }
    if (key === "POST /v1/clinics")
      return { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } };
    if (key === "GET /v1/onboarding") return { step: "basics" };
    if (key === "GET /v1/doctors") return { doctors: [] };
    if (key === "GET /v1/services") return { services: [] };
    if (key === "GET /v1/slot-rules") return { slotRules: null };
    if (key === "GET /v1/assistant") return { assistant: { name: "Muxaris" } };
    return {};
  });
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  h.refresh.mockReset();
  h.push.mockReset();
  h.replace.mockReset();
});
afterEach(cleanup);

const heading = (name: string) => screen.findByRole("heading", { name });

describe("Wizard", () => {
  it("resumes at the saved step for an existing clinic", async () => {
    setApi({
      "GET /v1/onboarding": { step: "services" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("What do you offer?");
  });

  it("does not refetch /onboarding after an in-wizard create + refresh", async () => {
    setApi({ "GET /v1/onboarding": { step: "basics" } });
    const { rerender } = render(<Wizard initialClinic={null} cookieStale={false} />);
    fireEvent.change(screen.getByLabelText("Clinic name"), { target: { value: "Test Clinic" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await heading("Who sees patients?");
    expect(h.refresh).toHaveBeenCalled();
    // The server re-render after router.refresh() now supplies the clinic.
    rerender(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).not.toContain("GET /v1/onboarding");
    expect(screen.getByRole("heading", { name: "Who sees patients?" })).toBeTruthy();
  });

  it("disables both step-1 actions while either is running", async () => {
    let release!: () => void;
    setApi({
      "POST /v1/clinics": () =>
        new Promise((res) => {
          release = () => res({ clinic: { id: "c1", name: "Sunrise", languages: ["en-IN"] } });
        }),
    });
    render(<Wizard initialClinic={null} cookieStale={false} />);
    const demo = screen.getByRole("button", { name: "Load demo clinic" }) as HTMLButtonElement;
    const cont = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    fireEvent.click(demo);
    await waitFor(() => expect(demo.disabled).toBe(true));
    expect(cont.disabled).toBe(true);
    release();
    await heading("Ready to go");
  });

  it("offers a retry when demo data fails to load", async () => {
    let fail = true;
    setApi({
      "POST /v1/demo/load": () => {
        if (fail) throw new ApiError(500, "boom", "Demo failed");
        return { ok: true };
      },
    });
    render(<Wizard initialClinic={null} cookieStale={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Load demo clinic" }));
    const retry = await screen.findByRole("button", { name: "Retry loading demo data" });
    expect(screen.getByRole("button", { name: "Continue manually" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/Demo failed/);
    fail = false;
    fireEvent.click(retry);
    await heading("Ready to go");
    expect(calls.filter((c) => c === "POST /v1/clinics")).toHaveLength(1);
  });

  it("shows an inline error when going back fails", async () => {
    setApi({
      "GET /v1/onboarding": { step: "doctors" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
      "PUT /v1/onboarding/step": () => {
        throw new ApiError(500, "x", "Could not save");
      },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("Who sees patients?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Could not save/));
  });

  it("does not show the demo-failed panel while the first demo load is still in flight", async () => {
    let release!: () => void;
    setApi({
      "POST /v1/demo/load": () =>
        new Promise((res) => {
          release = () => res({ ok: true });
        }),
    });
    render(<Wizard initialClinic={null} cookieStale={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Load demo clinic" }));
    await waitFor(() => expect(calls).toContain("POST /v1/demo/load"));
    expect(screen.queryByRole("button", { name: "Retry loading demo data" })).toBeNull();
    expect(screen.queryByText(/did not finish loading/)).toBeNull();
    release();
    await heading("Ready to go");
  });

  it("moves focus to the new step heading when the step changes", async () => {
    setApi();
    render(<Wizard initialClinic={null} cookieStale={false} />);
    fireEvent.change(screen.getByLabelText("Clinic name"), { target: { value: "Test Clinic" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const h1 = await heading("Who sees patients?");
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it("clears a stale Back error after a later step change succeeds", async () => {
    let failNext = true;
    setApi({
      "GET /v1/onboarding": { step: "doctors" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
      "PUT /v1/onboarding/step": () => {
        if (failNext) {
          failNext = false;
          throw new ApiError(500, "x", "Could not save");
        }
        return {};
      },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("Who sees patients?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Could not save/));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await heading("Tell us about your clinic");
    expect(screen.queryByText(/Could not save/)).toBeNull();
  });

  it("lets the rail jump back to a reached step and locks steps not reached yet", async () => {
    setApi({
      "GET /v1/onboarding": { step: "services" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("What do you offer?");
    const rail = within(screen.getByRole("complementary", { name: "Onboarding progress" }));
    expect(rail.getByText("Step 3 of 5")).toBeTruthy();
    const current = rail.getByRole("button", { current: "step" });
    expect(current.textContent).toMatch(/Services/);
    expect((rail.getByRole("button", { name: /Assistant/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((rail.getByRole("button", { name: /Review/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(rail.getByRole("button", { name: /Doctors \(completed\)/ }));
    await heading("Who sees patients?");
    expect(calls).toContain("PUT /v1/onboarding/step");
    // Services (the furthest step reached) stays reachable after stepping back.
    expect((rail.getByRole("button", { name: /Services/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((rail.getByRole("button", { name: /Assistant/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("locks the rail while a step is saving, so a jump cannot race the save", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setApi({
      "GET /v1/onboarding": { step: "services" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
      "POST /v1/services": async () => {
        await gate;
        return {};
      },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("What do you offer?");
    const rail = within(screen.getByRole("complementary", { name: "Onboarding progress" }));
    const doctors = rail.getByRole("button", { name: /Doctors/ }) as HTMLButtonElement;
    expect(doctors.disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(calls).toContain("POST /v1/services"));
    expect(doctors.disabled).toBe(true);
    fireEvent.click(doctors);
    expect(calls).not.toContain("PUT /v1/onboarding/step");

    release();
    await heading("Meet your assistant");
    expect(calls.filter((c) => c === "PUT /v1/onboarding/step")).toHaveLength(1);
    expect(doctors.disabled).toBe(false);
  });

  it("holds Continue while a rail jump is saving", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setApi({
      "GET /v1/onboarding": { step: "services" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
      "PUT /v1/onboarding/step": async () => {
        await gate;
        return {};
      },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("What do you offer?");
    const rail = within(screen.getByRole("complementary", { name: "Onboarding progress" }));
    fireEvent.click(rail.getByRole("button", { name: /Doctors/ }));
    const next = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    await waitFor(() => expect(next.disabled).toBe(true));
    fireEvent.click(next);
    expect(calls).not.toContain("POST /v1/services");
    release();
    await heading("Who sees patients?");
    expect(calls).not.toContain("POST /v1/services");
  });

  it("shows step errors in the card, under the heading", async () => {
    setApi({
      "GET /v1/onboarding": { step: "doctors" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("Who sees patients?");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Add at least one doctor");
    expect(alert.closest("section")?.querySelector("h1")?.textContent).toBe("Who sees patients?");
    expect(calls).not.toContain("POST /v1/doctors");
  });

  it("asks for at least one service when every row is unticked", async () => {
    setApi({
      "GET /v1/onboarding": { step: "services" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("What do you offer?");
    for (const box of screen.getAllByRole("checkbox", { name: "Offer" })) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Pick at least one service.");
    expect(calls).not.toContain("POST /v1/services");
  });

  it("starts the assistant step with one empty question and drops blank ones on save", async () => {
    const saved: unknown[] = [];
    setApi({
      "GET /v1/onboarding": { step: "assistant" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
      "PUT /v1/assistant": (_: string, init?: { body?: unknown }) => {
        saved.push(init?.body);
        return {};
      },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("Meet your assistant");
    expect(screen.getAllByRole("textbox", { name: "Question" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await heading("Ready to go");
    expect((saved[0] as { faq: unknown[] }).faq).toEqual([]);
  });

  it("asks for a greeting before previewing, on that language's card", async () => {
    setApi({
      "GET /v1/onboarding": { step: "assistant" },
      "GET /v1/clinics/c1": {
        clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN", "kn-IN"] },
      },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("Meet your assistant");
    fireEvent.change(screen.getByLabelText("Kannada greeting"), { target: { value: " " } });
    const previews = screen.getAllByRole("button", { name: "Preview" });
    fireEvent.click(previews[1]!);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Write a greeting first.");
    expect(alert.parentElement?.contains(previews[1]!)).toBe(true);
  });

  it("sends the clicked greeting to the voice preview and stops on a second click", async () => {
    setApi({
      "GET /v1/onboarding": { step: "assistant" },
      "GET /v1/clinics/c1": {
        clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN", "kn-IN"] },
      },
    });
    const voicePreview = vi.fn(() => new Promise<Blob>(() => undefined));
    render(
      <Wizard
        initialClinic={{ id: "c1", name: "Test Clinic" }}
        cookieStale={false}
        voicePreview={voicePreview}
      />,
    );
    await heading("Meet your assistant");
    fireEvent.change(screen.getByLabelText("Kannada greeting"), { target: { value: "Namaskara" } });
    const kannada = screen.getAllByRole("button", { name: "Preview" })[1]!;
    fireEvent.click(kannada);
    await waitFor(() =>
      expect(voicePreview).toHaveBeenCalledWith("c1", {
        text: "Namaskara",
        language: "kn-IN",
        speaker: DEFAULT_SPEAKER,
      }),
    );
    expect(kannada.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(kannada);
    expect(kannada.getAttribute("aria-pressed")).toBe("false");
    expect(voicePreview).toHaveBeenCalledTimes(1);
  });

  it("lists services on the review step with Indian number formatting", async () => {
    setApi({
      "GET /v1/onboarding": { step: "review" },
      "GET /v1/clinics/c1": { clinic: { id: "c1", name: "Test Clinic", languages: ["en-IN"] } },
      "GET /v1/doctors": { doctors: [{ name: "Dr. Meera Rao" }] },
      "GET /v1/services": {
        services: [
          { name: "Cleaning", durationMin: 30, priceInr: 1500 },
          { name: "Check-up", durationMin: 15, priceInr: null },
        ],
      },
    });
    render(<Wizard initialClinic={{ id: "c1", name: "Test Clinic" }} cookieStale={false} />);
    await heading("Ready to go");
    expect(await screen.findByText("Cleaning (30 min, ₹1,500)")).toBeTruthy();
    expect(screen.getByText("Check-up (15 min)")).toBeTruthy();
    expect(screen.getByText("Dr. Meera Rao")).toBeTruthy();
    expect(screen.getByText("Here is what Test Clinic is set up with.")).toBeTruthy();
  });

  it("uses an injected API client instead of the signed-in one", async () => {
    setApi();
    const injected = vi.fn(async (path: string) =>
      path === "/v1/onboarding"
        ? { step: "doctors" }
        : path.startsWith("/v1/clinics/")
          ? { clinic: { id: "c1", name: "Injected", languages: ["en-IN"] } }
          : { doctors: [] },
    );
    render(
      <Wizard
        initialClinic={{ id: "c1", name: "Injected" }}
        cookieStale={false}
        api={injected as never}
      />,
    );
    await heading("Who sees patients?");
    expect(injected).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});
