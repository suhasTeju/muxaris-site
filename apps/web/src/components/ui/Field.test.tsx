// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Field } from "./Field";
import { Input } from "./Input";

afterEach(cleanup);

describe("Field", () => {
  it("labels the control and links hint and error", () => {
    render(
      <Field label="Phone" hint="Ten digits" error="Enter a 10-digit Indian mobile number">
        <Input type="tel" />
      </Field>,
    );
    const input = screen.getByLabelText("Phone");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.className).toContain("aria-[invalid=true]:border-rose-invalid");
    const described = input.getAttribute("aria-describedby")!.split(" ");
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Ten digits",
      "Enter a 10-digit Indian mobile number",
    ]);
  });
});

describe("Button", () => {
  it("defaults to a 38px primary button that does not submit", () => {
    render(<Button>Add patient</Button>);
    const b = screen.getByRole("button", { name: "Add patient" });
    expect(b.getAttribute("type")).toBe("button");
    expect(b.className).toContain("bg-ink");
    expect(b.className).toContain("h-[38px]");
  });

  it("lets className override the size defaults", () => {
    render(
      <Button variant="secondary" size={44} className="px-[20px]">
        Back
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Back" });
    expect(b.className).toContain("px-[20px]");
    expect(b.className).not.toContain("px-[18px]");
  });
});
