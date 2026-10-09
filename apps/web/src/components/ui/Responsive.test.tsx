// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";
import { Segmented } from "./Segmented";
import { TableHead, TableRow, TableScroll } from "./Table";
import { Tabs } from "./Tabs";

afterEach(cleanup);

// jsdom has no layout, so these pin the responsive classes the README promises page owners. The
// desktop (lg) values are the design's and must stay; narrow-screen changes are max-lg / max-sm only.
describe("responsive primitives", () => {
  it("Tabs scroll sideways below 1024 without clipping the underline or widening the column", () => {
    render(
      <Tabs
        aria-label="Sections"
        value="b"
        items={[
          { id: "a", label: "Greeting" },
          { id: "b", label: "Voice" },
        ]}
      />,
    );
    const list = screen.getByRole("tablist");
    expect(list.className).toContain("border-b");
    expect(list.className).toContain("max-lg:overflow-x-auto");
    expect(list.className).toContain("max-lg:[contain:inline-size]");
    expect(list.className).toContain("max-lg:shadow-[inset_0_-1px_0_#e2e7ee]");
    const tab = screen.getByRole("tab", { name: "Voice" });
    expect(tab.className).toContain("shrink-0");
    expect(tab.className).toContain("-mb-px");
    expect(tab.className).toContain("max-lg:mb-0");
  });

  it("Segmented scrolls below 1024 when its container is narrower", () => {
    render(
      <Segmented
        aria-label="Range"
        value="7d"
        onChange={() => {}}
        items={[
          { id: "7d", label: "7 days" },
          { id: "30d", label: "30 days" },
        ]}
      />,
    );
    const track = screen.getByRole("tablist");
    expect(track.className).toContain("max-lg:overflow-x-auto");
    expect(screen.getByRole("tab", { name: "7 days" }).className).toContain("shrink-0");
  });

  it("PageHeader stacks and wraps its actions under 640, with a 22px title", () => {
    render(<PageHeader title="Calls" actions={<button type="button">Export</button>} />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Calls" });
    expect(h1.className).toContain("text-[26px]");
    expect(h1.className).toContain("max-sm:text-[22px]");
    const actions = screen.getByRole("button", { name: "Export" }).parentElement!;
    expect(actions.className).toContain("max-sm:flex-wrap");
    expect(actions.parentElement!.className).toContain("max-sm:flex-col");
  });

  it("TableScroll gives the table a minimum width inside a contained scroll box", () => {
    render(
      <TableScroll minWidth={560}>
        <TableHead columns="1fr 1fr">
          <span>When</span>
          <span>Caller</span>
        </TableHead>
        <TableRow columns="1fr 1fr">
          <span>09:12</span>
          <span>Asha</span>
        </TableRow>
      </TableScroll>,
    );
    const head = screen.getByText("When").parentElement!;
    const inner = head.parentElement!;
    expect(inner.style.minWidth).toBe("560px");
    const box = inner.parentElement!;
    expect(box.className).toContain("overflow-x-auto");
    expect(box.className).toContain("[contain:inline-size]");
  });
});
