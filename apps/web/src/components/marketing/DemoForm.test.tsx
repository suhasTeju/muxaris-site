// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoForm } from "./DemoForm";

const props = {
  cities: ["Bengaluru", "Other"],
  specialties: [{ value: "dental", label: "Dental clinic" }],
  languages: [{ value: "en-IN", label: "English" }],
};

function fill() {
  const set = (label: RegExp | string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  set("Your name", "Dr Asha");
  set("Clinic name", "Sunrise Dental");
  set("City", "Bengaluru");
  set("Mobile number", "98765 43210");
  set("Email", "asha@example.com");
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DemoForm", () => {
  it("keeps a polite status region mounted and posts the form body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchMock);
    render(<DemoForm {...props} />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    fill();
    fireEvent.submit(screen.getByRole("button", { name: "Request a demo" }).closest("form")!);
    const heading = await screen.findByRole("heading", { name: /Thank you/ });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByRole("status").textContent).toMatch(/sent/);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/v1\/demo-requests$/);
    expect(JSON.parse(init.body)).toMatchObject({
      name: "Dr Asha",
      clinic: "Sunrise Dental",
      city: "Bengaluru",
      phone: "98765 43210",
      email: "asha@example.com",
      specialty: "dental",
      language: "en-IN",
      website: "",
    });
  });

  it("marks the offending field invalid on a 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { issues: [{ path: ["phone"], message: "bad" }] } }),
      }),
    );
    render(<DemoForm {...props} />);
    fill();
    fireEvent.submit(screen.getByRole("button", { name: "Request a demo" }).closest("form")!);
    const phone = await screen.findByLabelText(/Mobile number/);
    await waitFor(() => expect(phone.getAttribute("aria-invalid")).toBe("true"));
    const describedBy = phone.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toMatch(/10-digit/);
    expect(screen.getByRole("status").textContent).toMatch(/mobile number/);
  });
});
