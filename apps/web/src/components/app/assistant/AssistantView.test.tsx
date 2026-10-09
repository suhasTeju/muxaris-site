// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@muxaris/shared";
import { assistantProfile, clinic } from "@/components/dev/fixtures";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ useApi: () => api, getAccessToken: async () => "t" }));

import { AssistantView } from "./AssistantView";
import type { VoicePreviewFetcher } from "./voice-preview";

const fetcher = vi.fn<VoicePreviewFetcher>(async () => new Blob(["x"], { type: "audio/wav" }));

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  api.mockReset();
  fetcher.mockClear();
});

function renderView(role: Role = "owner", assistant = assistantProfile) {
  return render(
    <ToastProvider>
      <AssistantView clinic={clinic} role={role} assistant={assistant} previewVoice={fetcher} />
    </ToastProvider>,
  );
}

const bar = () => screen.queryByRole("region", { name: "Unsaved changes" });

describe("AssistantView", () => {
  it("shows the saved profile, the Configure tab and the caller preview", () => {
    renderView();
    expect(screen.getByRole("tab", { name: /Configure/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tab", { name: /Try your assistant/ }).getAttribute("href")).toBe(
      "/app/assistant/try",
    );
    expect((screen.getByLabelText("Assistant name") as HTMLInputElement).value).toBe("Muxaris");
    expect(screen.getByRole("radio", { name: "Warm" }).getAttribute("aria-checked")).toBe("true");
    const tabs = within(screen.getByRole("tablist", { name: "Language" })).getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect((screen.getByLabelText("English greeting") as HTMLTextAreaElement).value).toBe(
      assistantProfile.greeting["en-IN"],
    );
    expect(screen.getByText("53/300")).toBeTruthy();
    expect((screen.getByLabelText(/Handoff phone number/) as HTMLInputElement).value).toBe(
      "+91 80412 34567",
    );
    expect(screen.getByText("3/30")).toBeTruthy();
    expect(screen.getByText("What callers hear first")).toBeTruthy();
    expect(screen.getByText("English · Shubh")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Record calls" })).toBeTruthy();
    expect(bar()).toBeNull();
  });

  it("switching language shows that greeting and voice", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: "ಕನ್ನಡ (Kannada)" }));
    expect((screen.getByLabelText("Kannada greeting") as HTMLTextAreaElement).value).toBe(
      assistantProfile.greeting["kn-IN"],
    );
    expect(screen.getByLabelText("Kannada voice")).toBeTruthy();
  });

  it("edits collect into one draft that Save PUTs, then the bar goes away", async () => {
    api.mockImplementation(async (_p: string, init: { body: object }) => ({
      assistant: { ...assistantProfile, ...init.body },
    }));
    renderView();
    fireEvent.change(screen.getByLabelText("Assistant name"), { target: { value: "Asha" } });
    fireEvent.click(screen.getByRole("radio", { name: "Formal" }));
    fireEvent.change(screen.getByLabelText("English voice"), { target: { value: "priya" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove question 2" }));
    expect(screen.getByText("2/30")).toBeTruthy();
    expect(screen.getByText("English · Priya")).toBeTruthy();
    expect(bar()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    const [path, init] = api.mock.calls[0]!;
    expect(path).toBe("/v1/assistant");
    expect(init.method).toBe("PUT");
    expect(init.body).toMatchObject({
      name: "Asha",
      tone: "formal",
      greeting: assistantProfile.greeting,
      voices: { ...assistantProfile.voices, "en-IN": "priya" },
      handoffNumber: "+918041234567",
      faq: [assistantProfile.faq[0], assistantProfile.faq[2]],
      knowledge: assistantProfile.knowledge,
    });
    await waitFor(() => expect(bar()).toBeNull());
    expect(screen.getByRole("status").textContent).toContain("Assistant updated");
  });

  it("Discard drops the draft", () => {
    renderView();
    fireEvent.change(screen.getByLabelText("Assistant name"), { target: { value: "Asha" } });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect((screen.getByLabelText("Assistant name") as HTMLInputElement).value).toBe("Muxaris");
    expect(bar()).toBeNull();
  });

  it("Generate from template fills every language's greeting", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Generate from template" }));
    expect((screen.getByLabelText("English greeting") as HTMLTextAreaElement).value).toBe(
      "Hello, welcome to Sunrise Dental Care. How may I help you today?",
    );
    fireEvent.click(screen.getByRole("tab", { name: "हिन्दी (Hindi)" }));
    expect((screen.getByLabelText("Hindi greeting") as HTMLTextAreaElement).value).toBe(
      "नमस्ते, Sunrise Dental Care में आपका स्वागत है। हम आपकी कैसे मदद कर सकते हैं?",
    );
    expect(bar()).toBeTruthy();
  });

  it("an empty greeting in another language blocks Save and opens that language", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: "தமிழ் (Tamil)" }));
    fireEvent.change(screen.getByLabelText("Tamil greeting"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("tab", { name: "English (English)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Tamil greeting")).toBeTruthy();
    expect(screen.getByText("Greeting needs 1 to 300 characters")).toBeTruthy();
  });

  it("a half-filled question and a bad handoff number are reported, not sent", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Add a question" }));
    const qs = screen.getAllByLabelText("Question");
    fireEvent.change(qs[qs.length - 1]!, { target: { value: "Do you do braces?" } });
    fireEvent.change(screen.getByLabelText(/Handoff phone number/), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid Indian phone number")).toBeTruthy();
    expect(screen.getByText(/Each question and answer needs text/)).toBeTruthy();
  });

  it("a failed save keeps the draft and says why", async () => {
    api.mockRejectedValue(new ApiError(403, "forbidden", "owner role required"));
    renderView();
    fireEvent.change(screen.getByLabelText("Assistant name"), { target: { value: "Asha" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Only the clinic owner can change this.",
      ),
    );
    expect(bar()).toBeTruthy();
  });

  it("Preview speaks the current greeting with its voice, and stops on a second press", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]![0]).toEqual({
      clinicId: clinic.id,
      text: assistantProfile.greeting["en-IN"],
      language: "en-IN",
      speaker: "shubh",
    });
    const stop = await screen.findByRole("button", { name: "Stop preview" });
    fireEvent.click(stop);
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
  });

  it("Preview explains provider and empty-greeting failures", async () => {
    fetcher.mockRejectedValueOnce(
      new ApiError(503, "preview_failed", "Voice preview is not available right now."),
    );
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Voice preview is not available right now.",
    );
    fireEvent.change(screen.getByLabelText("English greeting"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("alert").textContent).toBe("Write a greeting first.");
    expect(screen.getByText("Write a greeting first.", { selector: "p" })).toBeTruthy();
  });

  it("front desk sees the profile read-only", () => {
    renderView("front_desk");
    expect(screen.getByText("Only the clinic owner can change this.")).toBeTruthy();
    expect((screen.getByLabelText("Assistant name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("English greeting") as HTMLTextAreaElement).disabled).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "Warm" }) as HTMLButtonElement).matches(":disabled"),
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Generate from template" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove question/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a question" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    // Previewing the voice stays available.
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
  });

  it("with no saved profile it starts from defaults", () => {
    renderView("owner", null as never);
    expect((screen.getByLabelText("Assistant name") as HTMLInputElement).value).toBe("Muxaris");
    expect((screen.getByLabelText("English greeting") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByText("0/30")).toBeTruthy();
  });
});
