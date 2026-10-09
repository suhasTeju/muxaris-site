// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("aws-amplify/auth", () => ({ signOut: vi.fn() }));

import { AppShell } from "./AppShell";
import { ClinicProvider, type ClinicSummary } from "./clinic-context";
import { useToast } from "@/components/ui/Toaster";

afterEach(() => {
  cleanup();
  api.mockReset();
});

function Page() {
  const { toast } = useToast();
  return <button onClick={() => toast("Patient added")}>Save</button>;
}

function renderShell(clinics: ClinicSummary[]) {
  api.mockResolvedValue({ callbacks: [], total: 0 });
  return render(
    <ClinicProvider clinics={clinics} activeId={clinics[0]!.id} cookieStale={false}>
      <AppShell email="owner@sunrisedental.in" usage={null}>
        <Page />
      </AppShell>
    </ClinicProvider>,
  );
}

describe("AppShell", () => {
  it("renders the header: clinic, role chip, live status, email and sign out", () => {
    renderShell([{ id: "c1", name: "Sunrise Dental Care", role: "owner" }]);
    const header = within(screen.getByRole("banner"));
    expect(header.getByText("Sunrise Dental Care")).toBeTruthy();
    expect(header.getByText("Owner")).toBeTruthy();
    expect(header.getByText("Assistant live")).toBeTruthy();
    expect(header.getByText("owner@sunrisedental.in")).toBeTruthy();
    expect(header.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(header.queryByRole("combobox", { name: "Switch clinic" })).toBeNull();
  });

  it("offers a clinic switcher and the front-desk role label", () => {
    renderShell([
      { id: "c1", name: "Sunrise Dental Care", role: "front_desk" },
      { id: "c2", name: "Sunrise Dental Care · Indiranagar", role: "owner" },
    ]);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("combobox", { name: "Switch clinic" })).toBeTruthy();
    expect(header.getByText("Front desk")).toBeTruthy();
  });

  it("toggles the off-canvas menu and wires page toasts", () => {
    renderShell([{ id: "c1", name: "Sunrise Dental Care", role: "owner" }]);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle.getAttribute("aria-controls")).toBe("app-sidebar");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status").textContent).toContain("Patient added");
    expect(screen.getByRole("main").id).toBe("content");
  });
});
