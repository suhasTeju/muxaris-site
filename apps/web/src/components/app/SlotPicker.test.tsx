// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));

import { SlotPicker } from "./SlotPicker";

afterEach(cleanup);

describe("SlotPicker", () => {
  it("announces loading and empty states in a status live region", async () => {
    api.mockResolvedValue({ slots: [] });
    render(
      <SlotPicker
        serviceId="s1"
        date="2099-01-01"
        tz="Asia/Kolkata"
        doctorNames={{}}
        value={null}
        onPick={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Loading free slots…");
    expect((await screen.findByRole("status")).textContent).toBe("No free slots on this day.");
  });
});
