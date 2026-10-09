"use client";

import { useState } from "react";
import {
  CITIES,
  LANGUAGES,
  SPECIALTIES,
  SPECIALTY_LABELS,
  createClinicBody,
  type LanguageCode,
} from "@muxaris/shared";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import {
  LangChip,
  SelectField,
  StepFooter,
  StepShell,
  TextField,
  errMsg,
  issueMap,
  useStepBusy,
  type Call,
} from "./ui";

export interface ClinicInfo {
  specialty?: string | null;
  id: string;
  name: string;
  languages: LanguageCode[];
  city?: string | null;
  phone?: string | null;
}

export const SUNRISE_BASICS = {
  name: "Sunrise Dental Care",
  city: "Bengaluru",
  specialty: "dental",
  languages: LANGUAGES.map((l) => l.code),
};

export function StepBasics({
  clinic,
  call,
  onCreated,
  onContinue,
  onDemo,
  demoFailed,
  onRetryDemo,
}: {
  clinic: ClinicInfo | null;
  call: Call;
  onCreated: (c: ClinicInfo) => Promise<void>;
  onContinue: () => Promise<void>;
  onDemo: () => Promise<void>;
  /** The demo clinic exists but loading its data failed. */
  demoFailed: boolean;
  onRetryDemo: () => Promise<void>;
}) {
  const [name, setName] = useState(clinic?.name ?? "");
  const [specialty, setSpecialty] = useState(clinic?.specialty ?? "dental");
  const [city, setCity] = useState(clinic?.city ?? "Bengaluru");
  const [phone, setPhone] = useState(clinic?.phone ?? "");
  const [langs, setLangs] = useState<LanguageCode[]>(clinic?.languages ?? ["en-IN", "kn-IN"]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // One shared flag so no two actions (create, demo, retry) can run at once.
  const [pending, setPending] = useStepBusy<"create" | "demo" | "retry" | null>(null);
  const locked = clinic !== null;

  async function run(kind: "create" | "demo" | "retry", fn: () => Promise<void>) {
    setError(null);
    setPending(kind);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setPending(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return run("create", onContinue);
    const body = {
      name,
      specialty,
      city,
      languages: langs,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };
    const parsed = createClinicBody.safeParse(body);
    if (!parsed.success) {
      const m = issueMap(parsed.error.issues);
      if (m.name) m.name = "Enter your clinic name";
      if (m.languages) m.languages = "Pick at least one language";
      setErrors(m);
      return;
    }
    setErrors({});
    await run("create", async () => {
      const res = await call<{ clinic: { id: string; name: string; languages?: LanguageCode[] } }>(
        "/v1/clinics",
        { method: "POST", body },
      );
      await onCreated({
        id: res.clinic.id,
        name: res.clinic.name,
        languages: res.clinic.languages ?? langs,
        city,
        phone,
      });
    });
  }

  function toggle(code: LanguageCode) {
    setLangs((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepShell
        title="Tell us about your clinic"
        lead="This is what your assistant will introduce itself with."
        error={error}
        gap="gap-[22px]"
        footer={
          <StepFooter
            busy={pending === "create"}
            disabled={pending !== null}
            label={demoFailed ? "Continue manually" : "Continue"}
          />
        }
      >
        {!locked ? (
          <DemoBox
            text="Just exploring? Fill in a ready-made dental clinic and skip ahead."
            action="Load demo clinic"
            busy={pending === "demo"}
            disabled={pending !== null}
            onClick={() => run("demo", onDemo)}
          />
        ) : demoFailed ? (
          <DemoBox
            text="Your clinic was created, but the demo data did not finish loading."
            action="Retry loading demo data"
            busy={pending === "retry"}
            disabled={pending !== null}
            onClick={() => run("retry", onRetryDemo)}
          />
        ) : (
          <div className="flex items-center gap-[10px] rounded-12 border border-[#bfe5cb] bg-[#f0faf3] px-[14px] py-[12px] text-[14px] text-[#14532d]">
            <Lock size={16} aria-hidden="true" className="flex-none" />
            Your clinic is created. You can edit these details later in settings.
          </div>
        )}
        <TextField
          label="Clinic name"
          value={name}
          disabled={locked}
          error={errors.name}
          autoComplete="organization"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid gap-[16px] sm:grid-cols-2">
          <SelectField
            label="Specialty"
            value={specialty}
            disabled={locked}
            onChange={(e) => setSpecialty(e.target.value)}
            options={SPECIALTIES.map((s) => ({ value: s, label: SPECIALTY_LABELS[s] }))}
          />
          <SelectField
            label="City"
            value={city}
            disabled={locked}
            onChange={(e) => setCity(e.target.value)}
            options={CITIES.map((c) => ({ value: c, label: c }))}
          />
        </div>
        <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-[10px] border-0 p-0">
          <legend className="text-ink-2 mb-[10px] p-0 text-[13.5px] font-medium">
            Languages your patients speak
          </legend>
          <div className="flex flex-wrap gap-[8px]">
            {LANGUAGES.map((l) => (
              <LangChip
                key={l.code}
                label={`${l.label} (${l.native})`}
                on={langs.includes(l.code)}
                onToggle={() => toggle(l.code)}
              />
            ))}
          </div>
          {errors.languages ? (
            <span className="text-rose text-[12.5px]">{errors.languages}</span>
          ) : null}
        </fieldset>
        <TextField
          label="Clinic phone (optional)"
          className="max-w-[360px]"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          disabled={locked}
          error={errors.phone}
          hint="Indian mobile number, for example 98765 43210"
          onChange={(e) => setPhone(e.target.value)}
        />
      </StepShell>
    </form>
  );
}

/** Teal "Just exploring?" panel; also the retry panel when demo data failed to load. */
function DemoBox({
  text,
  action,
  busy,
  disabled,
  onClick,
}: {
  text: string;
  action: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="border-teal-line flex items-center justify-between gap-[20px] rounded-16 border bg-[linear-gradient(90deg,#e9f6f5,#f3f8fa)] px-[18px] py-[16px] max-sm:flex-col max-sm:items-start">
      <div className="flex items-center gap-[12px]">
        <span className="bg-surface text-teal-ink border-teal-line grid size-[34px] flex-none place-items-center rounded-10 border">
          <Sparkles size={16} aria-hidden="true" />
        </span>
        <span className="text-teal-deep text-[14.5px]">{text}</span>
      </div>
      <Button
        size={38}
        disabled={disabled}
        onClick={onClick}
        className="bg-teal shadow-none hover:bg-[#0b7f7c]"
      >
        {busy ? "One moment…" : action}
      </Button>
    </div>
  );
}
