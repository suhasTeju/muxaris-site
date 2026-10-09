// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BarList } from "./BarList";

afterEach(cleanup);

describe("BarList", () => {
  it("draws a bar per row scaled to the largest value, with counts and a data table", () => {
    render(
      <BarList
        title="Calls by language"
        labelWidth={92}
        rowGap={12}
        items={[
          { key: "en", label: <span>English</span>, text: "English", value: 1200, color: "red" },
          { key: "kn", label: <span>Kannada</span>, text: "Kannada", value: 300, color: "red" },
          { key: "ta", label: <span>Tamil</span>, text: "Tamil", value: 0, color: "red" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Calls by language" })).toBeTruthy();
    const bars = [...document.querySelectorAll<HTMLElement>("[data-bar]")];
    expect(bars.map((b) => b.style.width)).toEqual(["100%", "25%", "0%"]);
    expect(screen.getByText("1,200")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Calls by language" });
    expect(table.textContent).toContain("Kannada");
    expect(table.textContent).toContain("300");
  });
});
