// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/amplify", () => ({ authConfigured: true, googleEnabled: false }));

import { AuthShell } from "./auth-shell";

afterEach(cleanup);

describe("AuthShell", () => {
  it("renders the heading, aside, form and footer", () => {
    render(
      <AuthShell title="Welcome back" aside="Your calls are in good hands." footer="Footer">
        <form aria-label="Sign in" />
      </AuthShell>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeTruthy();
    expect(screen.getByText("Your calls are in good hands.")).toBeTruthy();
    expect(screen.getByRole("form", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Footer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Muxaris home" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("© 2026 Muxaris. All rights reserved.")).toBeTruthy();
  });
  it("replaces the form with a configuration alert when Cognito is not set up", () => {
    render(
      <AuthShell title="Welcome back" configured={false}>
        <form aria-label="Sign in" />
      </AuthShell>,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Sign-in is not configured/);
    expect(screen.queryByRole("form")).toBeNull();
  });
  it("drops its entrance and pulse animations under reduced motion", () => {
    const { container } = render(
      <AuthShell title="Welcome back">
        <form aria-label="Sign in" />
      </AuthShell>,
    );
    const animated = Array.from(container.querySelectorAll<HTMLElement>("[class*='animate-']"));
    expect(animated.length).toBeGreaterThanOrEqual(2);
    for (const el of animated) expect(el.className).toContain("motion-reduce:animate-none");
  });
  it("stacks to one column with 16px gutters below 1024px and hides the image pane", () => {
    const { container } = render(
      <AuthShell title="Welcome back">
        <form aria-label="Sign in" />
      </AuthShell>,
    );
    const root = container.firstElementChild!;
    expect(root.className).toContain("grid-cols-1");
    expect(root.className).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]");
    const [form, pane] = Array.from(root.children);
    expect(form!.className).toContain("px-[16px]");
    expect(pane!.className).toMatch(/(^| )hidden( |$)/);
    expect(pane!.className).toContain("lg:block");
  });
});
