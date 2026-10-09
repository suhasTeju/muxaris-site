// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_MS, ToastProvider, useToast, type ToastOptions } from "./Toaster";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger({ text, options }: { text: string; options?: ToastOptions }) {
  const { toast } = useToast();
  return <button onClick={() => toast(text, options)}>{`Fire ${text}`}</button>;
}

describe("Toaster", () => {
  it("shows a toast in a polite live region and auto-dismisses it after 4.2s", () => {
    render(
      <ToastProvider>
        <Trigger text="Patient added" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fire Patient added" }));
    const toast = screen.getByRole("status");
    expect(toast.textContent).toContain("Patient added");
    expect(toast.parentElement?.getAttribute("aria-live")).toBe("polite");

    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the action link and dismisses on the close button", () => {
    render(
      <ToastProvider>
        <Trigger
          text="Appointment booked by your assistant"
          options={{ action: { label: "View", href: "/app/appointments" } }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fire/ }));
    expect(screen.getByRole("link", { name: "View" }).getAttribute("href")).toBe(
      "/app/appointments",
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps at most three toasts, dropping the oldest", () => {
    render(
      <ToastProvider>
        {["one", "two", "three", "four"].map((t) => (
          <Trigger key={t} text={t} />
        ))}
      </ToastProvider>,
    );
    for (const t of ["one", "two", "three", "four"]) {
      fireEvent.click(screen.getByRole("button", { name: `Fire ${t}` }));
    }
    const texts = screen.getAllByRole("status").map((s) => s.textContent);
    expect(texts).toHaveLength(3);
    expect(texts.join(" ")).not.toContain("one");
    expect(texts[2]).toContain("four");
  });

  it("uses the tone tile colours from the design", () => {
    render(
      <ToastProvider>
        <Trigger text="Failed" options={{ tone: "bad" }} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fire Failed" }));
    const tile = screen
      .getByRole("status")
      .querySelector("span[aria-hidden='true']") as HTMLElement;
    expect(tile.style.background).toBe("rgb(247, 168, 187)");
  });

  it("is a harmless no-op without a provider", () => {
    render(<Trigger text="Orphan" />);
    fireEvent.click(screen.getByRole("button", { name: "Fire Orphan" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
