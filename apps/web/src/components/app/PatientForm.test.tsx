// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { PatientForm } from "./PatientForm";

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("PatientForm", () => {
  it("creates a patient with phone, name, email and language", async () => {
    const onSaved = vi.fn();
    api.mockResolvedValue({ patient: { id: "pat_9" } });
    render(<PatientForm mode="create" onSaved={onSaved} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Ravi" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "r@x.com" } });
    fireEvent.change(screen.getByLabelText(/language/i), { target: { value: "kn-IN" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/patients", {
        method: "POST",
        body: { phone: "9876543210", name: "Ravi", email: "r@x.com", preferredLanguage: "kn-IN" },
      }),
    );
    expect(onSaved).toHaveBeenCalledWith({ id: "pat_9" });
  });

  it("edits only changed fields and clears email with null", async () => {
    api.mockResolvedValue({ patient: { id: "pat_1" } });
    render(
      <PatientForm
        mode="edit"
        patientId="pat_1"
        initial={{
          name: "Ravi",
          email: "r@x.com",
          preferredLanguage: "en-IN",
          dob: null,
          notes: null,
        }}
        onSaved={() => undefined}
        onCancel={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/patients/pat_1", {
        method: "PATCH",
        body: { email: null },
      }),
    );
  });

  it("asks for a valid Indian mobile number before posting", async () => {
    render(<PatientForm mode="create" onSaved={() => undefined} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(
      await screen.findByText("Enter a 10-digit Indian mobile number, for example 98765 43210."),
    ).toBeTruthy();
    expect(screen.getByLabelText(/phone/i).getAttribute("aria-invalid")).toBe("true");
    expect(api).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate-phone error", async () => {
    api.mockRejectedValue(
      Object.assign(new Error("a patient with this phone already exists"), { status: 409 }),
    );
    render(<PatientForm mode="create" onSaved={() => undefined} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/already exists/i);
  });
});
