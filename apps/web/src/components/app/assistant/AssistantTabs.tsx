import { PhoneCall, SlidersHorizontal } from "lucide-react";
import { Tabs } from "@/components/ui";

const ITEMS = [
  { id: "configure", label: "Configure", icon: SlidersHorizontal, href: "/app/assistant" },
  { id: "try", label: "Try your assistant", icon: PhoneCall, href: "/app/assistant/try" },
];

/** Configure / Try your assistant tabs under the Assistant page titles. */
export function AssistantTabs({ current }: { current: "configure" | "try" }) {
  return <Tabs aria-label="Assistant" items={ITEMS} value={current} />;
}
