// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

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
});
