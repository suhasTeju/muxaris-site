"use client";

import { Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { assertRuntimeEnv, env } from "@/lib/env";
import {
  DEMO_MESSAGES,
  FIELD_HINTS,
  FIELD_LABELS,
  checkMessage,
  validateDemo,
  type DemoFormState,
  type DemoStatus,
} from "./demo-request";

interface Option {
  value: string;
  label: string;
}

function Label({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <label
      className={cn(
        "text-ink flex flex-col gap-[8px] text-[14px] font-medium",
        wide && "sm:col-span-2",
      )}
    >
      {children}
    </label>
  );
}

export function DemoForm({
  cities,
  specialties,
  languages,
  initialState,
}: {
  cities: string[];
  specialties: Option[];
  languages: Option[];
  initialState?: DemoFormState;
}) {
  const [status, setStatus] = useState<DemoStatus>(initialState?.status ?? "idle");
  const [message, setMessage] = useState(initialState?.message ?? "");
  const [errors, setErrors] = useState<Record<string, string>>(initialState?.errors ?? {});
  const formRef = useRef<HTMLFormElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const sentHere = useRef(false);

  useEffect(() => {
    if (status === "done" && sentHere.current) doneHeading.current?.focus();
  }, [status]);

  function fail(fieldErrors: Record<string, string>, fallback: string) {
    setStatus("error");
    setErrors(fieldErrors);
    const keys = Object.keys(fieldErrors);
    setMessage(keys.length ? checkMessage(keys) : fallback);
    const first = keys[0];
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { company_url: trap, ...data } = Object.fromEntries(new FormData(e.currentTarget));
    const invalid = validateDemo(data);
    if (Object.keys(invalid).length) {
      fail(invalid, DEMO_MESSAGES.checkDetails);
      return;
    }
    setStatus("sending");
    setMessage("Sending…");
    setErrors({});
    try {
      assertRuntimeEnv();
      const res = await fetch(`${env.apiUrl}/v1/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The API's honeypot field is `website`; the DOM input uses a less autofill-friendly name.
        body: JSON.stringify({ ...data, website: trap ?? "" }),
      });
      if (res.ok) {
        sentHere.current = true;
        setStatus("done");
        setMessage(DEMO_MESSAGES.sent);
        return;
      }
      if (res.status === 429) {
        fail({}, DEMO_MESSAGES.rateLimited);
      } else if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as {
          error?: { issues?: { path?: (string | number)[]; message?: string }[] };
        } | null;
        const fieldErrors: Record<string, string> = {};
        for (const issue of body?.error?.issues ?? []) {
          const key = String(issue.path?.[0] ?? "");
          if (key && FIELD_LABELS[key] && !fieldErrors[key]) {
            fieldErrors[key] = FIELD_HINTS[key] ?? issue.message ?? "Please check this field.";
          }
        }
        fail(fieldErrors, DEMO_MESSAGES.checkDetails);
      } else {
        fail({}, DEMO_MESSAGES.server);
      }
    } catch (err) {
      fail(
        {},
        err instanceof Error && err.message.startsWith("This deployment is misconfigured")
          ? err.message
          : DEMO_MESSAGES.network,
      );
    }
  }

  const clear = (name: string) => () =>
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  const field = (name: string) => ({
    name,
    onChange: clear(name),
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] && FIELD_HINTS[name] ? `demo-err-${name}` : undefined,
  });
  const hint = (name: string) =>
    errors[name] && FIELD_HINTS[name] ? (
      <span id={`demo-err-${name}`} className="text-rose text-[13px] font-normal">
        {errors[name]}
      </span>
    ) : null;

  // One polite region, always mounted: it announces sending and success, and shows errors.
  const live = (
    <div
      role="status"
      aria-live="polite"
      className={
        status === "error"
          ? "rounded-12 border-rose-line bg-rose-soft text-rose-deep flex items-start gap-[10px] border px-[14px] py-[12px] text-[14px] leading-[1.5] sm:col-span-2"
          : "sr-only"
      }
    >
      {status === "error" ? (
        <CircleAlert size={16} aria-hidden className="mt-[2px] flex-none" />
      ) : null}
      {message}
    </div>
  );

  if (status === "done") {
    return (
      <div>
        {live}
        <div className="flex animate-[mxIn8_.35s_ease_both] flex-col items-start gap-[14px] px-[4px] py-[24px] motion-reduce:animate-none">
          <span className="rounded-14 bg-green-soft text-green-ink grid size-[48px] place-items-center">
            <Check size={22} aria-hidden />
          </span>
          <h3
            ref={doneHeading}
            tabIndex={-1}
            className="m-0 text-[26px] font-semibold tracking-[-0.03em] outline-none"
          >
            Thank you. We have your request.
          </h3>
          <p className="text-ink-3 m-0 text-[16px] leading-[1.6]">
            Someone from Muxaris will call or email you within one working day to set up your demo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="relative grid gap-x-[16px] gap-y-[18px] sm:grid-cols-2"
    >
      <Label>
        Your name
        <Input size={48} soft {...field("name")} required maxLength={120} autoComplete="name" />
      </Label>
      <Label>
        Clinic name
        <Input
          size={48}
          soft
          {...field("clinic")}
          required
          maxLength={160}
          autoComplete="organization"
        />
      </Label>
      <Label>
        City
        <Select
          size={48}
          soft
          {...field("city")}
          required
          defaultValue=""
          className="focus:bg-subtle"
        >
          <option value="" disabled>
            Select city
          </option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        Specialty
        <Select
          size={48}
          soft
          {...field("specialty")}
          required
          defaultValue="dental"
          className="focus:bg-subtle"
        >
          {specialties.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        Mobile number
        <Input
          size={48}
          soft
          {...field("phone")}
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
        />
        {hint("phone")}
      </Label>
      <Label>
        Email
        <Input
          size={48}
          soft
          {...field("email")}
          type="email"
          required
          maxLength={200}
          autoComplete="email"
        />
        {hint("email")}
      </Label>
      <Label wide>
        Preferred language for the call
        <Select
          size={48}
          soft
          {...field("language")}
          required
          defaultValue="en-IN"
          className="focus:bg-subtle"
        >
          {languages.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </Label>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this field empty
          <input name="company_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {live}

      <div className="flex flex-col gap-[12px] pt-[6px] sm:col-span-2">
        <Button
          type="submit"
          size={52}
          block
          disabled={status === "sending"}
          className="shadow-cta"
        >
          {status === "sending" ? "Sending…" : "Request a demo"}
        </Button>
        <p className="text-muted m-0 text-center text-[13px]">
          We use your details only to contact you about Muxaris. See our{" "}
          <Link href="/privacy" className="text-teal-ink underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
