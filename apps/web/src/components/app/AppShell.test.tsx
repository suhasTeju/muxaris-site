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
      <AppShell email="owner@example.com" usage={null} openCallbacks={0}>
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
    expect(header.getByText("owner@example.com")).toBeTruthy();
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

  it("moves focus into the menu, makes the page inert, and hands focus back on Escape", () => {
    renderShell([{ id: "c1", name: "Sunrise Dental Care", role: "owner" }]);
    const toggle = screen.getByRole("button", { name: "Open menu" });
    toggle.focus();
    fireEvent.click(toggle);
    const aside = document.getElementById("app-sidebar")!;
    expect(aside.contains(document.activeElement)).toBe(true);
    expect(document.getElementById("content")!.hasAttribute("inert")).toBe(true);
    // The header stays reachable, so screen readers can find Close menu.
    expect(screen.getByRole("banner").closest("[inert]")).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open menu" }));
    expect(document.getElementById("content")!.hasAttribute("inert")).toBe(false);
  });

  it("closes from the backdrop with focus on the menu button, and from a link without", () => {
    renderShell([{ id: "c1", name: "Sunrise Dental Care", role: "owner" }]);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(document.querySelector(".fixed.inset-0")!);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open menu" }));

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const calls = within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", {
      name: "Calls",
    });
    calls.addEventListener("click", (e) => e.preventDefault()); // jsdom cannot navigate
    calls.focus();
    fireEvent.click(calls);
    expect(screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Open menu" }));
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
