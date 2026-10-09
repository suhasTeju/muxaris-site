"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  /** Heading text; also the dialog's accessible name. */
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Button row pinned under the body (#fbfcfd, top rule), right-aligned. */
  footer?: React.ReactNode;
  /**
   * dialog: centred card (default). drawer: right-hand panel 12px from the edges
   * (Appointment and Doctor panels). Both become a bottom sheet under 640px.
   */
  variant?: "dialog" | "drawer";
  /** Max width in px: dialogs 440 / 520 / 560 in the design, drawers 400 / 460. */
  width?: number;
  /** Replaces the heading row's left side (e.g. a badge, title and time stack). Close stays. */
  header?: React.ReactNode;
  className?: string;
}

/**
 * Accessible modal: focuses the first field (or button), traps Tab, closes on Escape, locks page
 * scroll, restores focus to the trigger. Rendered into document.body, so mount it only on the
 * client (open it from state), never during the server render.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  variant = "dialog",
  width,
  header,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Mount-only: focus the first field, trap Tab, lock page scroll, restore focus on close.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const body = bodyRef.current;
    const first =
      body?.querySelector<HTMLElement>("[autofocus], input, select, textarea") ??
      body?.querySelector<HTMLElement>("button:not([disabled])") ??
      ref.current;
    first?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !ref.current.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !ref.current.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, []);

  const drawer = variant === "drawer";
  const w = width ?? (drawer ? 400 : 520);
  const sizeVar = { "--mx-modal-w": `${w}px` } as React.CSSProperties;

  const panel = (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={sizeVar}
      className={cn(
        "bg-surface animate-mx-sheet relative flex w-full flex-col overflow-hidden outline-none",
        // Bottom sheet under 640px.
        "max-h-[92vh] rounded-t-20 max-sm:shadow-dialog",
        drawer
          ? "sm:border-line sm:shadow-drawer sm:fixed sm:top-[12px] sm:right-[12px] sm:bottom-[12px] sm:z-[91] sm:max-h-none sm:w-[var(--mx-modal-w)] sm:rounded-20 sm:border"
          : "sm:shadow-dialog sm:max-h-[calc(100vh-48px)] sm:max-w-[var(--mx-modal-w)] sm:rounded-20",
        className,
      )}
    >
      <div
        className={cn(
          "flex justify-between gap-[12px]",
          drawer
            ? "border-chip items-start border-b px-[20px] py-[18px]"
            : "items-center px-[22px] pt-[20px] pb-[14px]",
          header ? "items-start" : undefined,
        )}
      >
        {header ? (
          <div className="min-w-0">
            <span id={titleId} className="sr-only">
              {title}
            </span>
            {header}
          </div>
        ) : (
          <h2
            id={titleId}
            className={cn(
              "m-0 font-semibold tracking-[-0.02em]",
              drawer ? "text-[18px]" : "text-[19px]",
            )}
          >
            {title}
          </h2>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="border-line bg-surface hover:bg-paper grid size-[32px] shrink-0 cursor-pointer place-items-center rounded-9 border"
        >
          <X size={15} />
        </button>
      </div>
      <div
        ref={bodyRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-auto",
          drawer ? "gap-[14px] px-[20px] py-[18px]" : "gap-[16px] px-[22px] pb-[20px]",
        )}
      >
        {children}
      </div>
      {footer ? (
        <div
          className={cn(
            "bg-surface-2 border-chip flex justify-end gap-[8px] border-t py-[14px]",
            drawer ? "px-[20px]" : "px-[22px]",
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );

  const overlay = drawer ? (
    <div className="fixed inset-0 z-[90] flex items-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="animate-mx-fade absolute inset-0 bg-[rgba(12,18,32,0.32)] sm:bg-[rgba(12,18,32,0.18)]"
      />
      {panel}
    </div>
  ) : (
    <div className="animate-mx-fade fixed inset-0 z-[95] flex items-end justify-center bg-[rgba(12,18,32,0.32)] backdrop-blur-[3px] sm:items-center sm:p-[24px]">
      {panel}
    </div>
  );

  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
