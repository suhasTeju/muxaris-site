// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "./Modal";

afterEach(cleanup);

function Harness({ variant }: { variant?: "dialog" | "drawer" }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      {open ? (
        <Modal
          title="New appointment"
          variant={variant}
          width={560}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button onClick={() => setOpen(false)}>Cancel</button>
              <button>Book appointment</button>
            </>
          }
        >
          <input aria-label="Patient phone" />
        </Modal>
      ) : null}
    </div>
  );
}

describe("ui/Modal", () => {
  it("is labelled by its heading, focuses the first field and traps Tab through the footer", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "New appointment" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.style.getPropertyValue("--mx-modal-w")).toBe("560px");
    expect(document.activeElement).toBe(screen.getByLabelText("Patient phone"));

    screen.getByRole("button", { name: "Book appointment" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Book appointment" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("renders into document.body as a bottom sheet under 640px", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.className).toContain("rounded-t-20");
    expect(dialog.className).toContain("sm:rounded-20");
    expect(dialog.className).toContain("animate-mx-sheet");
  });

  it("drawer closes from its backdrop", () => {
    render(<Harness variant="drawer" />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("sm:right-[12px]");
    const backdrop = dialog.previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
