// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Modal } from "./Modal";

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <button onClick={() => setN(n + 1)}>Rerender</button>
      {open ? (
        <Modal title="Edit" onClose={() => setOpen(false)}>
          <input aria-label="First" />
          <input aria-label="Second" />
          <button>Save</button>
        </Modal>
      ) : null}
    </div>
  );
}

describe("Modal", () => {
  it("focuses the first field, traps Tab, locks scroll and restores focus to the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByLabelText("First"));
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");

    // Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last.
    screen.getByRole("button", { name: "Save" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("does not steal focus when the parent re-renders with a new onClose", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const second = screen.getByLabelText("Second");
    second.focus();
    fireEvent.click(screen.getByRole("button", { name: "Rerender" }));
    // fireEvent does not move focus, so if the mount effect re-ran it would have refocused First
    expect(document.activeElement).not.toBe(screen.getByLabelText("First"));
  });
});
