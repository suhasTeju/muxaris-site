// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("aws-amplify/auth", () => ({ signIn: vi.fn(), signInWithRedirect: vi.fn() }));
vi.mock("@/lib/amplify", () => ({ googleEnabled: false, authConfigured: true }));

import { SignInForm } from "./sign-in-form";

afterEach(cleanup);

describe("SignInForm", () => {
  it("shows the verified banner", () => {
    query = "verified=1";
    render(<SignInForm />);
    expect(screen.getByRole("status").textContent).toMatch(/Email confirmed/);
  });
  it("shows the reset banner", () => {
    query = "reset=1";
    render(<SignInForm />);
    expect(screen.getByRole("status").textContent).toMatch(/Password updated/);
  });
  it("shows no banner by default", () => {
    query = "";
    render(<SignInForm />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
