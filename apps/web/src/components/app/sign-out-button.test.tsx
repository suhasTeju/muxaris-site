// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { signOut, replace } = vi.hoisted(() => ({ signOut: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("aws-amplify/auth", () => ({ signOut }));

import { SignOutButton } from "./sign-out-button";

afterEach(() => {
  cleanup();
  signOut.mockReset();
  replace.mockReset();
});

describe("SignOutButton", () => {
  it("signs out globally and clears stored state", async () => {
    signOut.mockResolvedValue(undefined);
    sessionStorage.setItem("muxaris_verify_email", "a@b.c");
    sessionStorage.setItem("other", "keep");
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(signOut).toHaveBeenCalledWith({ global: true });
    expect(sessionStorage.getItem("muxaris_verify_email")).toBeNull();
    expect(sessionStorage.getItem("other")).toBe("keep");
  });
  it("falls back to a local sign-out when the global one fails", async () => {
    signOut.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
