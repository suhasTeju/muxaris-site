// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("aws-amplify/auth", () => ({ resetPassword: vi.fn(), confirmResetPassword: vi.fn() }));

import { ForgotPasswordForm, type ResetAuth } from "./forgot-password-form";

afterEach(cleanup);

const named = (name: string) => Object.assign(new Error(name), { name });

function submit(container: HTMLElement) {
  fireEvent.submit(container.querySelector("form")!);
}

describe("ForgotPasswordForm", () => {
  it("moves to the code step without revealing whether the account exists", async () => {
    const auth = {
      resetPassword: vi.fn(async () => {
        throw named("UserNotFoundException");
      }),
      confirmResetPassword: vi.fn(),
    } as unknown as ResetAuth;
    const { container } = render(<ForgotPasswordForm auth={auth} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.in" } });
    submit(container);
    expect((await screen.findByRole("status")).textContent).toMatch(/If an account exists/);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByLabelText("Code")).toBeTruthy();
    expect(screen.getByText(/At least 8 characters/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new code" })).toBeTruthy();
  });
  it("sets the new password and returns to sign in with the reset notice", async () => {
    const confirm = vi.fn(async () => undefined);
    const auth = {
      resetPassword: vi.fn(async () => ({})),
      confirmResetPassword: confirm,
    } as unknown as ResetAuth;
    const { container } = render(<ForgotPasswordForm auth={auth} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " a@b.in " } });
    submit(container);
    fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Abcdefg1" } });
    submit(container);
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/sign-in?reset=1"));
    expect(confirm).toHaveBeenCalledWith({
      username: "a@b.in",
      confirmationCode: "123456",
      newPassword: "Abcdefg1",
    });
  });
  it("shows rate limiting as an error above the form", async () => {
    const auth = {
      resetPassword: vi.fn(async () => {
        throw named("LimitExceededException");
      }),
      confirmResetPassword: vi.fn(),
    } as unknown as ResetAuth;
    const { container } = render(<ForgotPasswordForm auth={auth} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.in" } });
    submit(container);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Too many attempts/);
  });
});
