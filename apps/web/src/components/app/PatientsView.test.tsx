// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Patient } from "@muxaris/shared";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { PatientsView } from "./PatientsView";

afterEach(() => {
  cleanup();
  api.mockReset();
  vi.useRealTimers();
});

describe("PatientsView", () => {
  it("keeps what was typed and searches after the debounce", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue({ patients: [], total: 0 });
    render(<PatientsView initial={[]} initialTotal={0} tz="Asia/Kolkata" />);
    const input = screen.getByLabelText("Search patients") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "rav" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(input.value).toBe("rav");
    expect(api).toHaveBeenCalledWith("/v1/patients?limit=50&offset=0&q=rav");
  });

  it("lists patients with avatar initials, masked phone, language, email and added date", () => {
    render(
      <PatientsView
        initial={[patient("p1", "Ananya Krishnan"), patient("p2", null)]}
        initialTotal={2}
        tz="Asia/Kolkata"
      />,
    );
    expect(screen.getByText("2 patients")).toBeTruthy();
    const row = screen.getByRole("link", { name: /Ananya Krishnan/ });
    expect(row.getAttribute("href")).toBe("/app/patients/p1");
    expect(row.textContent).toBe("AKAnanya Krishnan+91 •••• ••3210Englisha@x.com8 Oct");
    expect(screen.getByRole("link", { name: /Unnamed/ }).textContent).toContain("?");
  });

  it("explains an empty clinic and an empty search", async () => {
    vi.useFakeTimers();
    api.mockResolvedValue({ patients: [], total: 0 });
    render(<PatientsView initial={[]} initialTotal={0} tz="Asia/Kolkata" />);
    expect(screen.getByText(/No patients yet\./)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search patients"), { target: { value: "zz" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(screen.getByText("No patients match that search.")).toBeTruthy();
  });

  it("loads the next page of 50 with Load more", async () => {
    api.mockResolvedValue({ patients: [patient("p2", "Rohan Mehta")], total: 2 });
    render(
      <PatientsView
        initial={[patient("p1", "Ananya Krishnan")]}
        initialTotal={2}
        tz="Asia/Kolkata"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    });
    expect(api).toHaveBeenCalledWith("/v1/patients?limit=50&offset=1");
    expect(screen.getByText("Rohan Mehta")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("opens the Add patient dialog", () => {
    render(<PatientsView initial={[]} initialTotal={0} tz="Asia/Kolkata" />);
    fireEvent.click(screen.getByRole("button", { name: "Add patient" }));
    expect(screen.getByRole("dialog", { name: "Add patient" })).toBeTruthy();
    expect(screen.getByLabelText("Phone")).toBeTruthy();
  });
  it("scrolls the patient table inside its card on narrow screens", () => {
    render(
      <PatientsView
        initial={[patient("p1", "Ananya Krishnan")]}
        initialTotal={1}
        tz="Asia/Kolkata"
      />,
    );
    const row = screen.getByRole("link", { name: /Ananya Krishnan/ });
    const scroller = row.closest(".overflow-x-auto")!;
    expect(scroller).toBeTruthy();
    expect(scroller.firstElementChild!.className).toContain("min-w-[760px]");
  });
});

function patient(id: string, name: string | null): Patient {
  return {
    id,
    clinicId: "cl_1",
    phoneMasked: "+91 •••• ••3210",
    name,
    email: name ? "a@x.com" : null,
    preferredLanguage: "en-IN",
    dob: null,
    notes: null,
    consentAt: null,
    createdAt: "2026-10-08T06:30:00.000Z",
    updatedAt: "2026-10-08T06:30:00.000Z",
  };
}
