// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoForm } from "./DemoForm";
import { DEMO_MESSAGES, validateDemo } from "./demo-request";

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
const submit = () =>
  fireEvent.submit(screen.getByRole("button", { name: "Request a demo" }).closest("form")!);

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
    submit();
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

  it("checks the fields before sending, as the design does", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DemoForm {...props} />);
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "12345" } });
    submit();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(
      "Please check: Your name, Clinic name, City, Mobile number, Email.",
    );
    const name = screen.getByLabelText("Your name");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    const phone = screen.getByLabelText(/Mobile number/);
    expect(document.getElementById(phone.getAttribute("aria-describedby")!)?.textContent).toMatch(
      /10-digit/,
    );
    // Typing into a field clears its error.
    fireEvent.change(name, { target: { value: "Dr Asha" } });
    expect(name.getAttribute("aria-invalid")).toBeNull();
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
    submit();
    const phone = await screen.findByLabelText(/Mobile number/);
    await waitFor(() => expect(phone.getAttribute("aria-invalid")).toBe("true"));
    const describedBy = phone.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toMatch(/10-digit/);
    expect(screen.getByRole("status").textContent).toMatch(/Mobile number/);
  });

  it.each([
    [429, DEMO_MESSAGES.rateLimited],
    [500, DEMO_MESSAGES.server],
  ])("explains a %i", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
    render(<DemoForm {...props} />);
    fill();
    submit();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(message));
  });

  it("explains a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<DemoForm {...props} />);
    fill();
    submit();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(DEMO_MESSAGES.network));
  });

  it("can open in the sent state without stealing focus", () => {
    render(<DemoForm {...props} initialState={{ status: "done", message: DEMO_MESSAGES.sent }} />);
    const heading = screen.getByRole("heading", { name: /Thank you/ });
    expect(document.activeElement).not.toBe(heading);
    expect(screen.queryByRole("button", { name: "Request a demo" })).toBeNull();
  });
});

describe("validateDemo", () => {
  const ok = { name: "A", clinic: "B", city: "Bengaluru", phone: "", email: "a@b.in" };
  it.each(["98765 43210", "+91 98765 43210", "919876543210", "098765 43210", "(0) 98765-43210"])(
    "accepts %s, as the server's indianPhone does",
    (phone) => {
      expect(validateDemo({ ...ok, phone })).toEqual({});
    },
  );
  it.each(["58765 43210", "98765", "02212345678", "+44 98765 43210"])("rejects %s", (phone) => {
    expect(Object.keys(validateDemo({ ...ok, phone }))).toEqual(["phone"]);
  });
  it("rejects a malformed email", () => {
    expect(Object.keys(validateDemo({ ...ok, phone: "9876543210", email: "nope" }))).toEqual([
      "email",
    ]);
  });
});
