// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FAQS } from "@/lib/content";
import { Faq } from "./Faq";

afterEach(cleanup);

describe("Faq", () => {
  it("opens the first answer and keeps one open at a time", () => {
    render(<Faq />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(FAQS.length);
    const answer = (b: HTMLElement) => document.getElementById(b.getAttribute("aria-controls")!)!;
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("true");
    expect(answer(buttons[0]!).hidden).toBe(false);
    expect(answer(buttons[1]!).hidden).toBe(true);

    fireEvent.click(buttons[1]!);
    expect(buttons[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(buttons[1]!.getAttribute("aria-expanded")).toBe("true");
    expect(answer(buttons[1]!).textContent).toBe(FAQS[1]!.a);

    fireEvent.click(buttons[1]!);
    expect(buttons.every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
  });

  it("puts every answer in the page, for search and the FAQPage schema", () => {
    render(<Faq />);
    for (const f of FAQS) expect(screen.getByText(f.a)).toBeTruthy();
  });

  it("uses h3 questions under its own heading, h2 under the /faq page title", () => {
    render(<Faq />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Questions clinics ask first." }),
    ).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(FAQS.length);
    cleanup();
    render(<Faq heading={false} />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(FAQS.length);
  });
});
