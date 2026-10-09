// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let query = "";
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("aws-amplify/auth", () => ({ signIn: vi.fn(), signOut, signInWithRedirect: vi.fn() }));
vi.mock("@/lib/amplify", () => ({ googleEnabled: false, authConfigured: true }));

import { SignInForm, type SignInAuth } from "./sign-in-form";

afterEach(() => {
  cleanup();
  signOut.mockReset();
});

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
  it("signs out a stale Amplify session before showing the form when the API rejected it", async () => {
    query = "reason=session&next=%2Fapp%2Fcalls";
    let finish!: () => void;
    signOut.mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<SignInForm />);
    expect(signOut).toHaveBeenCalledTimes(1);
    // Nothing to submit (and so no UserAlreadyAuthenticated bounce) while the session is cleared.
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    await act(async () => finish());
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/session expired/i);
  });
  it("still shows the form when signOut fails", async () => {
    query = "reason=session";
    signOut.mockRejectedValue(new Error("offline"));
    render(<SignInForm />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
  });
  it("does not sign out on a normal visit", () => {
    query = "";
    render(<SignInForm />);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("shows a Cognito error above the form and keeps the fields", async () => {
    query = "";
    const auth: SignInAuth = {
      signIn: vi.fn(async () => {
        throw Object.assign(new Error("Incorrect"), { name: "NotAuthorizedException" });
      }),
      signOut: vi.fn(async () => undefined),
      signInWithRedirect: vi.fn(async () => undefined),
      googleEnabled: false,
    };
    const { container } = render(<SignInForm auth={auth} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.in" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.submit(container.querySelector("form")!);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/don’t match/);
    // The message sits before the form, as in the design.
    expect(alert.compareDocumentPosition(container.querySelector("form")!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByRole("link", { name: "Forgot password?" }).getAttribute("href")).toBe(
      "/forgot-password",
    );
  });
  it("shows Continue with Google only when Google is enabled", async () => {
    query = "";
    const redirect = vi.fn(() => new Promise<void>(() => undefined));
    const base = { signIn: vi.fn(), signOut: vi.fn(), signInWithRedirect: redirect };
    const { rerender } = render(
      <SignInForm auth={{ ...base, googleEnabled: false } as unknown as SignInAuth} />,
    );
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    rerender(<SignInForm auth={{ ...base, googleEnabled: true } as unknown as SignInAuth} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(redirect).toHaveBeenCalledWith({ provider: "Google" });
    await screen.findByRole("button", { name: "Redirecting…" });
  });
});
