import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ getAccessToken: vi.fn(async () => "t") }));

import { fetchGreetingAudio } from "./StepAssistant";

const body = { text: "Hello", language: "en-IN", speaker: "shubh" } as const;

function respond(status: number) {
  const fetch = vi.fn(async () => new Response(status === 200 ? "audio" : "", { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchGreetingAudio", () => {
  it("posts the greeting for the clinic and returns the audio", async () => {
    const fetch = respond(200);
    const blob = await fetchGreetingAudio("c1", body);
    expect(await blob.text()).toBe("audio");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/v1/assistant/preview")).toBe(true);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Clinic-Id"]).toBe("c1");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it.each([
    [503, "Voice preview is not available right now."],
    [429, "Too many previews. Try again later."],
    [500, "Could not play the preview. Please try again."],
  ])("maps a %i to its message", async (status, message) => {
    respond(status);
    await expect(fetchGreetingAudio("c1", body)).rejects.toMatchObject({ status, message });
  });
});
