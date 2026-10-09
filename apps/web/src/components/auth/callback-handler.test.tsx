// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let query = "";
const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("aws-amplify/utils", () => ({ Hub: { listen: vi.fn(() => () => undefined) } }));
vi.mock("aws-amplify/auth", () => ({ fetchAuthSession: vi.fn() }));

import { CallbackHandler, type CallbackAuth } from "./callback-handler";

afterEach(() => {
  cleanup();
  nav.replace.mockReset();
});

function stub(hasSession = false) {
  let emit: (event: string) => void = () => undefined;
  const auth: CallbackAuth = {
    listen: (cb) => {
      emit = cb;
      return () => undefined;
    },
    hasSession: () => Promise.resolve(hasSession),
  };
  return { auth, emit: (e: string) => emit(e) };
}

describe("CallbackHandler", () => {
  it("shows the signing-in state, then follows a safe next once signed in", async () => {
    query = "next=%2Fapp%2Fcalls";
    const s = stub();
    render(<CallbackHandler auth={s.auth} />);
    expect(screen.getByRole("status").textContent).toBe("Signing you in…");
    await act(async () => s.emit("signInWithRedirect"));
    expect(nav.replace).toHaveBeenCalledWith("/app/calls");
  });
  it("goes straight on when a session already exists", async () => {
    query = "";
    render(<CallbackHandler auth={stub(true).auth} />);
    await act(async () => undefined);
    expect(nav.replace).toHaveBeenCalledWith("/app");
  });
  it("shows the failure copy with a way back when Google returns an error", () => {
    query = "error=access_denied";
    render(<CallbackHandler auth={stub().auth} />);
    expect(screen.getByRole("alert").textContent).toMatch(/couldn’t complete Google sign-in/);
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
      "/sign-in",
    );
  });
  it("shows the failure copy when the redirect fails", async () => {
    query = "";
    const s = stub();
    render(<CallbackHandler auth={s.auth} />);
    await act(async () => s.emit("signInWithRedirect_failure"));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
