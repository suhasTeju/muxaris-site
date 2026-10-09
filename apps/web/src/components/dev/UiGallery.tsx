"use client";

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Plus,
  Search,
  Timer,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  Field,
  Input,
  KpiCard,
  Modal,
  MonoLabel,
  Notice,
  PageHeader,
  SectionHeader,
  Segmented,
  Select,
  Spinner,
  Switch,
  TableGroup,
  TableHead,
  TableRow,
  TableScroll,
  Tabs,
  Textarea,
  badgeFor,
  useToast,
  type ButtonVariant,
  type Tone,
} from "@/components/ui";
import { appointments, doctors, services } from "./fixtures";

const TONES: Tone[] = ["good", "warn", "bad", "muted", "info"];
const VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "ghost",
  "ghost-teal",
  "danger",
  "danger-outline",
  "danger-ghost",
  "dashed",
];
const COLS = "120px minmax(0,1fr) minmax(0,1fr) 130px";

/** Wall-clock IST "4:30 pm" for a fixture instant. */
function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Development-only gallery of every `components/ui` primitive, for screenshots and visual checks.
 * `modal` opens a dialog or drawer on load and `toasts` fires two toasts, so a headless browser
 * can capture those states from the URL alone.
 */
export function UiGallery({
  modal: initialModal,
  toasts,
}: {
  modal?: "dialog" | "drawer";
  toasts?: boolean;
}) {
  const { toast } = useToast();
  const [modal, setModal] = useState<"" | "dialog" | "drawer">(initialModal ?? "");
  const [tab, setTab] = useState("open");
  const [seg, setSeg] = useState("day");
  const [section, setSection] = useState("greeting");
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!toasts) return;
    toast("Booking rules saved");
    toast("Appointment booked by your assistant", { action: { label: "View", href: "#" } });
  }, [toasts, toast]);

  const today = appointments.filter((a) => a.startsAt.startsWith("2026-10-09")).slice(2, 7);

  return (
    <div className="animate-mx-in flex flex-col gap-[22px]">
      <PageHeader
        title="UI kit"
        subtitle="Every primitive in components/ui, on fixture data."
        actions={
          <Button
            icon={Plus}
            onClick={() =>
              toast("Appointment booked by your assistant", {
                action: { label: "View", href: "#" },
              })
            }
          >
            New appointment
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Phone} label="Calls today" value="9" hint="Average 84s" />
        <KpiCard
          icon={CalendarCheck}
          label="Booked by assistant"
          value="2"
          hint="Calls that ended in a booking today"
        />
        <KpiCard
          icon={PhoneIncoming}
          label="Open callbacks"
          value="3"
          hint="View the callback queue"
          hintTone="link"
          href="#"
          badge={
            <Badge tone="bad" size={20}>
              1 urgent
            </Badge>
          }
        />
        <KpiCard
          icon={Timer}
          label="Minutes used this month"
          value="1,842"
          unit="/ 3,000"
          meter={{ used: 1842, included: 3000 }}
          hint="Standard plan"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <SectionHeader
            title="Today's appointments"
            link={{ href: "#", label: "All appointments" }}
          />
          <TableScroll minWidth={560}>
            <TableHead columns={COLS}>
              <span>Time</span>
              <span>Patient</span>
              <span>Service</span>
              <span>Status</span>
            </TableHead>
            <TableGroup>Friday, 9 October</TableGroup>
            {today.map((a) => {
              const b = badgeFor("appt", a.status);
              return (
                <TableRow key={a.id} href="#" columns={COLS} className="py-[12px]">
                  <span className="text-ink-2 font-mono text-[12.5px]">{istTime(a.startsAt)}</span>
                  <span className="truncate font-medium">{a.patient?.name ?? "New caller"}</span>
                  <span className="text-ink-3 truncate">
                    {services.find((s) => s.id === a.serviceId)?.name} ·{" "}
                    {doctors.find((d) => d.id === a.doctorId)?.name}
                  </span>
                  <span>
                    <Badge tone={b.tone}>{b.label}</Badge>
                  </span>
                </TableRow>
              );
            })}
          </TableScroll>
          <div className="h-[10px]" />
        </Card>

        <Card className="flex flex-col gap-[14px] p-[18px]">
          <Tabs
            aria-label="Status"
            value={tab}
            onChange={setTab}
            items={[
              { id: "open", label: "Open", count: 3 },
              { id: "done", label: "Done", count: 2 },
            ]}
          />
          <Tabs
            aria-label="Assistant sections"
            value={section}
            onChange={setSection}
            items={[
              { id: "greeting", label: "Greeting" },
              { id: "voice", label: "Voice and languages" },
              { id: "faq", label: "Questions", count: 3 },
              { id: "knowledge", label: "Clinic knowledge" },
              { id: "handoff", label: "Handoff" },
            ]}
          />
          <Segmented
            aria-label="View"
            value={seg}
            onChange={setSeg}
            items={[
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
            ]}
          />
          <Field label="Patient phone" hint="Ten digits">
            <Input type="tel" placeholder="+91 98765 43210" />
          </Field>
          <Field label="Search" variant="filter">
            <Input icon={Search} size={40} placeholder="Name, phone or email" soft />
          </Field>
          <Field label="Outcome" error="Pick one">
            <Select>
              <option>All outcomes</option>
            </Select>
          </Field>
          <Field label="Notes" counter="0/160">
            <Textarea />
          </Field>
          <div className="flex flex-wrap items-center gap-[12px]">
            <Switch checked={on} onCheckedChange={setOn} aria-label="Record calls" />
            <Switch
              size={28}
              checked={!on}
              onCheckedChange={(v) => setOn(!v)}
              aria-label="Opposite"
            />
            <Checkbox label="Mon" defaultChecked />
            <Chip>Owner</Chip>
            <MonoLabel>Colour</MonoLabel>
            <Spinner />
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-[16px] p-[20px]">
        <MonoLabel>Buttons</MonoLabel>
        <div className="flex flex-wrap items-center gap-[8px]">
          {VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-[8px]">
          {([26, 30, 34, 38, 44, 48, 56] as const).map((s) => (
            <Button key={s} size={s} variant="secondary">
              {s}px
            </Button>
          ))}
          <Button iconOnly icon={Trash2} variant="danger-ghost" size={34} aria-label="Delete" />
          <Button variant="dashed" size={34} icon={UserPlus}>
            Add a doctor
          </Button>
          <ButtonLink href="#" icon={PhoneCall} size={44}>
            Try your assistant
          </ButtonLink>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          <Button variant="secondary" onClick={() => setModal("dialog")}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => setModal("drawer")}>
            Open drawer
          </Button>
          <Button variant="secondary" onClick={() => toast("Couldn't save", { tone: "bad" })}>
            Bad toast
          </Button>
          <Button variant="secondary" onClick={() => toast("Copied", { tone: "info" })}>
            Info toast
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-[16px] p-[20px]">
        <MonoLabel>Badges, chips and notices</MonoLabel>
        <div className="flex flex-wrap items-center gap-[8px]">
          {TONES.map((t) => (
            <Badge key={t} tone={t}>
              {t}
            </Badge>
          ))}
          {TONES.map((t) => (
            <Badge key={`o-${t}`} tone={t} variant="outline" size={20}>
              {t}
            </Badge>
          ))}
          {TONES.map((t) => (
            <Chip key={`c-${t}`} tone={t}>
              {t}
            </Chip>
          ))}
        </div>
        <div className="grid gap-[8px] sm:grid-cols-2">
          <Notice tone="bad" title="Couldn't save">
            Enter a 10-digit Indian mobile number.
          </Notice>
          <Notice tone="warn">The assistant is paused outside clinic hours.</Notice>
          <Notice tone="muted">Only the clinic owner can change this.</Notice>
          <Notice tone="info">Changes apply to the next call.</Notice>
        </div>
      </Card>

      <EmptyState action={<Button>Place a test call</Button>}>No calls yet.</EmptyState>

      {modal ? (
        <Modal
          title={modal === "dialog" ? "New appointment" : "Dr. Meera Rao"}
          variant={modal}
          width={modal === "dialog" ? 560 : 460}
          onClose={() => setModal("")}
          footer={
            <>
              <Button variant="secondary" size={40} onClick={() => setModal("")}>
                Cancel
              </Button>
              <Button size={40} className="px-[16px]">
                Book appointment
              </Button>
            </>
          }
        >
          <Field label="Service" variant="lg">
            <Select size={42}>
              <option>Choose a service</option>
              {services.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Patient name (optional)" variant="lg">
            <Input size={42} />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
