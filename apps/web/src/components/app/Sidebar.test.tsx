// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/callbacks" }));

import { Sidebar } from "./Sidebar";

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe("Sidebar", () => {
  it("links Callbacks and shows the open count", async () => {
    api.mockResolvedValue({ callbacks: [], total: 3 });
    render(<Sidebar open onNavigate={() => undefined} />);
    const link = screen.getByRole("link", { name: /Callbacks/ });
    expect(link.getAttribute("href")).toBe("/app/callbacks");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(await screen.findByLabelText("3 open")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/v1/callbacks?status=open&limit=1");
  });

  it("renders no badge when the count is zero or the request fails", async () => {
    api.mockRejectedValue(new Error("down"));
    render(<Sidebar open onNavigate={() => undefined} />);
    await screen.findByRole("link", { name: "Callbacks" });
    expect(screen.queryByLabelText(/open$/)).toBeNull();
  });
});
