import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T>(f: T) => f,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("aws-amplify/auth/server", () => ({ fetchAuthSession: vi.fn() }));
vi.mock("./amplify-server", () => ({
  runWithAmplifyServerContext: async () => ({ tokens: { accessToken: "tok" } }),
}));

import { getServerMe, requireSession, serverApi } from "./api-server";

function respond(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      statusText: "",
      text: async () => JSON.stringify(body),
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());

describe("401 handling", () => {
  it("serverApi redirects to /sign-in?reason=session on a 401 (not only the layout)", async () => {
    respond(401, { error: { code: "unauthorized", message: "no" } });
    await expect(serverApi("/v1/doctors", { clinicId: "c1" })).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?reason=session",
    );
  });
  it("getServerMe redirects on a 401", async () => {
    respond(401, { error: { code: "unauthorized", message: "no" } });
    await expect(getServerMe()).rejects.toThrow("NEXT_REDIRECT:/sign-in?reason=session");
  });
  it("leaves other failures for the error boundary", async () => {
    respond(503, { error: { code: "unavailable", message: "down" } });
    await expect(serverApi("/v1/doctors", { clinicId: "c1" })).rejects.toMatchObject({
      status: 503,
    });
  });
  it("passes results through", async () => {
    await expect(requireSession(async () => 7)).resolves.toBe(7);
  });
});
