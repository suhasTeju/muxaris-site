// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Nav } from "./Nav";

vi.mock("next/image", () => ({
  default: (p: { src: string; alt: string }) => <img src={p.src} alt={p.alt} />,
}));

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function darkSection(top: number, bottom: number) {
  const el = document.createElement("section");
  el.setAttribute("data-theme", "dark");
  el.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe("Nav", () => {
  it("is light by default and switches to dark glass over a dark section", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const dark = darkSection(500, 1400);
    render(<Nav />);
    const header = screen.getByRole("banner");
    expect(header.dataset.tone).toBe("light");

    dark.getBoundingClientRect = () => ({ top: -200, bottom: 700 }) as DOMRect;
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header.dataset.tone).toBe("dark");

    dark.getBoundingClientRect = () => ({ top: -900, bottom: -10 }) as DOMRect;
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(header.dataset.tone).toBe("light");
  });
});
