import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import DevLayout from "./layout";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dev preview layout", () => {
  it("is a 404 outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DevLayout({ children: null })).toThrow("NEXT_NOT_FOUND");
    vi.stubEnv("NODE_ENV", "test");
    expect(() => DevLayout({ children: null })).toThrow("NEXT_NOT_FOUND");
  });

  it("renders in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(DevLayout({ children: "preview" })).toBeTruthy();
  });
});
