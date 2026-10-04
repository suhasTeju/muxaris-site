"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  switcher,
  right,
  children,
}: {
  switcher: React.ReactNode;
  right: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar open={open} onToggle={() => setOpen((o) => !o)} switcher={switcher} right={right} />
      <div className="flex flex-1 flex-col md:flex-row">
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
