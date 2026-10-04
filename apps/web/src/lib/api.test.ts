import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, buildRequest } from "./api";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("buildRequest", () => {
  it("builds url and headers", () => {
    const { url, init } = buildRequest(
      "/v1/appointments",
      { method: "POST", body: { a: 1 }, clinicId: "c1" },
      { token: "tok" },
    );
    expect(url).toBe("http://localhost:4000/v1/appointments");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok",
      "X-Clinic-Id": "c1",
      "Content-Type": "application/json",
    });
  });

  it("omits optional headers", () => {
    const { init } = buildRequest("/v1/me");
    expect(init.method).toBe("GET");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.headers).not.toHaveProperty("X-Clinic-Id");
    expect(init.body).toBeUndefined();
  });
});

describe("apiFetch", () => {
  it("returns parsed JSON", async () => {
    const fn = mockFetch(200, { ok: true });
    await expect(apiFetch("/v1/me", {}, { token: "t" })).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("maps error envelope to ApiError", async () => {
    mockFetch(422, {
      error: { code: "validation_error", message: "bad input", issues: [{ message: "required" }] },
    });
    const err = (await apiFetch("/v1/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "validation_error", message: "bad input" });
    expect(err.issues).toEqual([{ message: "required" }]);
  });

  it("falls back for non-JSON errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 })),
    );
    const err = await apiFetch("/v1/x").catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "http_error" });
  });
});
