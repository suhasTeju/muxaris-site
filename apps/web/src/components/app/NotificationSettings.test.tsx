// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { NotificationSettings } from "./NotificationSettings";

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("NotificationSettings", () => {
  it("renders two switches and PATCHes only the toggled key", async () => {
    api.mockResolvedValue({
      clinic: { settings: { notifications: { confirmations: true, reminders: false } } },
    });
    render(
      <NotificationSettings
        clinicId="cl_1"
        initial={{ confirmations: true, reminders: true }}
        isOwner
      />,
    );
    expect(screen.getByRole("switch", { name: "Send confirmations" })).toBeTruthy();
    const reminders = screen.getByRole("switch", { name: "Send reminders" });
    expect(reminders.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(reminders);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/v1/clinics/cl_1", {
        method: "PATCH",
        body: { settings: { notifications: { reminders: false } } },
      }),
    );
    await waitFor(() => expect(reminders.getAttribute("aria-checked")).toBe("false"));
  });

  it("keeps the old value and shows an error when saving fails", async () => {
    api.mockRejectedValue(new Error("boom"));
    render(
      <NotificationSettings
        clinicId="cl_1"
        initial={{ confirmations: true, reminders: true }}
        isOwner
      />,
    );
    const sw = screen.getByRole("switch", { name: "Send confirmations" });
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("non-owners see read-only text and no switches", () => {
    render(
      <NotificationSettings
        clinicId="cl_1"
        initial={{ confirmations: true, reminders: false }}
        isOwner={false}
      />,
    );
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText(/Only the clinic owner can change this\./)).toBeTruthy();
  });
});
