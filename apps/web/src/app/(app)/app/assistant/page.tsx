import { PhoneCall } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

// Placeholder until the Assistant configuration page lands (AppAssistant.dc.html).
export default function AssistantPage() {
  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <PageHeader
        title="Assistant"
        subtitle="How it introduces itself, and how it sounds in each language."
      />
      <ButtonLink href="/app/assistant/try" icon={PhoneCall} className="self-start">
        Try your assistant
      </ButtonLink>
    </div>
  );
}
