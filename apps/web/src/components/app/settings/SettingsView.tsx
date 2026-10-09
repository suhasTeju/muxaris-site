"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  clinicNotificationSettings,
  clinicRecordCalls,
  type AssistantProfile,
  type Clinic,
  type Doctor,
  type Role,
  type Service,
  type SlotRules,
  type UsageSummary,
} from "@muxaris/shared";
import { PageHeader } from "@/components/ui";
import { NotificationSettings } from "../NotificationSettings";
import { UpgradeButton } from "../UpgradeButton";
import { AssistantSummary } from "./AssistantSummary";
import { BookingRulesSection } from "./BookingRulesSection";
import { ClinicSection } from "./ClinicSection";
import { DoctorsSection } from "./DoctorsSection";
import { ServicesSection } from "./ServicesSection";

const TOC: Array<[id: string, label: string]> = [
  ["set-clinic", "Clinic"],
  ["set-plan", "Plan"],
  ["set-doctors", "Doctors"],
  ["set-services", "Services"],
  ["set-rules", "Booking rules"],
  ["set-assistant", "Assistant"],
  ["set-notifications", "Notifications"],
];

export interface SettingsViewProps {
  clinic: Clinic;
  role: Role;
  doctors: Doctor[];
  services: Service[];
  slotRules: SlotRules;
  /** null until the assistant profile exists. */
  assistant: AssistantProfile | null;
  /** null when usage could not be loaded. */
  usage: UsageSummary | null;
  billing: { enabled: boolean };
  /** Status of the clinic's latest subscription, if any. */
  subscriptionStatus?: string | undefined;
}

function SettingsNav() {
  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-[84px] hidden flex-col gap-[2px] lg:flex"
    >
      {TOC.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => {
            const el = document.getElementById(id);
            if (!el) return;
            e.preventDefault();
            window.scrollTo({
              top: el.getBoundingClientRect().top + window.scrollY - 80,
              behavior: "smooth",
            });
          }}
          className="text-ink-3 hover:bg-surface hover:text-ink flex h-[34px] items-center rounded-9 px-[10px] text-[13.5px] font-medium"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

/** /app/settings: the clinic's configuration, editable in place by the owner. */
export function SettingsView(props: SettingsViewProps) {
  const router = useRouter();
  const isOwner = props.role === "owner";
  const [clinic, setClinic] = useState(props.clinic);
  const [doctors, setDoctors] = useState(props.doctors);
  const [services, setServices] = useState(props.services);
  const [rules, setRules] = useState(props.slotRules);
  const upsert =
    <T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>) =>
    (item: T) =>
      set((list) =>
        list.some((x) => x.id === item.id)
          ? list.map((x) => (x.id === item.id ? item : x))
          : [...list, item],
      );

  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <PageHeader title="Settings" subtitle={clinic.name} />
      <div className="grid grid-cols-1 items-start gap-[28px] lg:grid-cols-[190px_minmax(0,1fr)]">
        <SettingsNav />
        <div className="flex max-w-[820px] min-w-0 flex-col gap-[14px]">
          <ClinicSection
            clinic={clinic}
            isOwner={isOwner}
            onSaved={(c) => {
              setClinic(c);
              // The shell's clinic name comes from the server layout.
              router.refresh();
            }}
          />
          <UpgradeButton
            usage={props.usage}
            isOwner={isOwner}
            billing={props.billing}
            tz={clinic.timezone}
            subscriptionStatus={props.subscriptionStatus}
          />
          <DoctorsSection
            doctors={doctors}
            clinicLanguages={clinic.languages}
            isOwner={isOwner}
            onSaved={upsert(setDoctors)}
          />
          <ServicesSection
            services={services.filter((s) => s.active)}
            isOwner={isOwner}
            onChange={upsert(setServices)}
          />
          <BookingRulesSection rules={rules} isOwner={isOwner} onSaved={setRules} />
          <AssistantSummary
            assistant={props.assistant}
            recordCalls={clinicRecordCalls(clinic.settings)}
          />
          <NotificationSettings
            clinicId={clinic.id}
            initial={clinicNotificationSettings(clinic.settings)}
            isOwner={isOwner}
          />
        </div>
      </div>
    </div>
  );
}
