// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultWeekHours, type WeekHours } from "@/lib/onboarding";
import { WorkingHoursGrid } from "./WorkingHoursGrid";

afterEach(cleanup);

function Harness({ onWeek }: { onWeek: (w: WeekHours) => void }) {
  const [w, setW] = useState(defaultWeekHours());
  return (
    <WorkingHoursGrid
      idPrefix="t"
      value={w}
      onChange={(n) => {
        setW(n);
        onWeek(n);
      }}
    />
  );
}

describe("WorkingHoursGrid", () => {
  it("keeps the day and time columns and scrolls inside its border on narrow screens", () => {
    render(<Harness onWeek={() => undefined} />);
    const group = screen.getByRole("group", { name: "Working hours" });
    expect(group.className).toContain("overflow-x-auto");
    expect(group.firstElementChild!.className).toContain("min-w-[500px]");
  });
  it("shows an error when end is not after start", () => {
    render(<Harness onWeek={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Tuesday closes"), { target: { value: "09:00" } });
    expect(screen.getByRole("alert").textContent).toMatch(/End time must be after start time/);
  });
  it("copies Monday to all days, opening Sunday", () => {
    let last: WeekHours = [];
    render(<Harness onWeek={(w) => (last = w)} />);
    fireEvent.change(screen.getByLabelText("Monday opens"), { target: { value: "08:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy Monday to all" }));
    expect(last.every((d) => d.open && d.start === "08:30" && d.end === "20:00")).toBe(true);
    expect(screen.getByLabelText("Sunday opens")).toBeTruthy();
  });
});
