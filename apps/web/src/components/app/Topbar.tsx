"use client";

import { Building2, Menu, X } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { useClinic } from "./clinic-context";
import { ClinicSwitcher } from "./clinic-switcher";
import { SignOutButton } from "./sign-out-button";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", front_desk: "Front desk" };

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * 60px sticky header: clinic chip, name or switcher, role chip; on the right the live dot, the
 * signed-in email and Sign out. Below 1024px a menu button opens the off-canvas sidebar.
 */
export function Topbar({
  open,
  onToggle,
  menuButtonRef,
  email,
}: {
  open: boolean;
  onToggle: () => void;
  /** The menu button, so the shell can return focus to it when the menu closes. */
  menuButtonRef?: React.Ref<HTMLButtonElement>;
  email: string;
}) {
  const { activeClinic } = useClinic();
  return (
    <header className="border-line sticky top-0 z-30 flex h-[60px] items-center justify-between gap-[16px] border-b bg-[rgba(244,246,249,0.8)] px-[16px] backdrop-blur-[16px] sm:px-[24px] lg:px-[32px]">
      <div className="flex min-w-0 items-center gap-[10px]">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="app-sidebar"
          aria-label={open ? "Close menu" : "Open menu"}
          className="border-field bg-surface text-ink hover:bg-paper grid size-[34px] shrink-0 cursor-pointer place-items-center rounded-9 border lg:hidden"
        >
          {open ? <X size={16} /> : <Menu size={16} />}
        </button>
        <span className="border-line bg-surface text-teal-ink grid size-[28px] shrink-0 place-items-center rounded-8 border">
          <Building2 size={14} />
        </span>
        <div className="min-w-0">
          <ClinicSwitcher />
        </div>
        <Chip className="shrink-0">{roleLabel(activeClinic.role)}</Chip>
      </div>
      <div className="flex shrink-0 items-center gap-[14px]">
        {/* Static label from the design: not backed by a health check or the clinic's setup. */}
        <span className="text-muted hidden items-center gap-[8px] text-[13px] whitespace-nowrap sm:flex">
          <span className="bg-signal animate-mx-pulse size-[7px] rounded-full" />
          Assistant live
        </span>
        <span aria-hidden="true" className="bg-line hidden h-[20px] w-px md:block" />
        <span className="text-ink-2 hidden text-[13.5px] md:inline">{email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
