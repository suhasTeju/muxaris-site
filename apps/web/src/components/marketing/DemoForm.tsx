"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { env } from "@/lib/env";

interface Option {
  value: string;
  label: string;
}
type Status = "idle" | "sending" | "done" | "error";

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  clinic: "clinic name",
  city: "city",
  phone: "mobile number",
  email: "email",
  specialty: "specialty",
  language: "language",
};
const FIELD_HINTS: Record<string, string> = {
  phone: "Enter a 10-digit Indian mobile number, for example 98765 43210.",
  email: "Enter a valid email address, for example you@clinic.in.",
};

const field =
  "mt-1.5 min-h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-base text-dark-text placeholder:text-dark-muted focus:border-accent-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright/40";

export function DemoForm({
  cities,
  specialties,
  languages,
}: {
  cities: string[];
  specialties: Option[];
  languages: Option[];
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status === "done") doneHeading.current?.focus();
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setStatus("sending");
    setMessage("Sending…");
    setErrors({});
    try {
      const res = await fetch(`${env.apiUrl}/v1/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setStatus("done");
        setMessage("Thank you. Your demo request was sent.");
        return;
      }
      setStatus("error");
      if (res.status === 429) {
        setMessage("That’s a lot of requests from your network. Please try again in an hour.");
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
        setErrors(fieldErrors);
        const names = Object.keys(fieldErrors).map((k) => FIELD_LABELS[k]);
        setMessage(
          names.length
            ? `Please check: ${names.join(", ")}.`
            : "Please check your details and try again.",
        );
        const first = Object.keys(fieldErrors)[0];
        if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      } else {
        setMessage(
          "Something went wrong on our side. Please try again, or email hello@muxaris.com.",
        );
      }
    } catch {
      setStatus("error");
      setMessage("We couldn’t reach the server. Check your connection and try again.");
    }
  }

  const a11y = (name: string) => ({
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `demo-err-${name}` : undefined,
  });
  const err = (name: string) =>
    errors[name] ? (
      <span id={`demo-err-${name}`} className="mt-1.5 block text-sm text-[#fda4af]">
        {errors[name]}
      </span>
    ) : null;

  const live = (
    <div
      role="status"
      aria-live="polite"
      className={
        status === "error"
          ? "mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
          : "sr-only"
      }
    >
      {message}
    </div>
  );

  if (status === "done") {
    return (
      <div>
        {live}
        <div className="rounded-3xl border border-accent-bright/40 bg-white/[0.05] p-8 sm:p-10">
          <h3
            ref={doneHeading}
            tabIndex={-1}
            className="font-display text-3xl tracking-tight outline-none"
          >
            Thank you. We have your request.
          </h3>
          <p className="text-dark-muted mt-3 leading-relaxed">
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
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm">
          Your name
          <input
            name="name"
            {...a11y("name")}
            required
            maxLength={120}
            autoComplete="name"
            className={field}
          />
          {err("name")}
        </label>
        <label className="block text-sm">
          Clinic name
          <input
            name="clinic"
            {...a11y("clinic")}
            required
            maxLength={160}
            autoComplete="organization"
            className={field}
          />
          {err("clinic")}
        </label>
        <label className="block text-sm">
          City
          <select name="city" {...a11y("city")} required defaultValue="" className={field}>
            <option value="" disabled>
              Select city
            </option>
            {cities.map((c) => (
              <option key={c} value={c} className="text-ink">
                {c}
              </option>
            ))}
          </select>
          {err("city")}
        </label>
        <label className="block text-sm">
          Specialty
          <select
            name="specialty"
            {...a11y("specialty")}
            required
            defaultValue="dental"
            className={field}
          >
            {specialties.map((s) => (
              <option key={s.value} value={s.value} className="text-ink">
                {s.label}
              </option>
            ))}
          </select>
          {err("specialty")}
        </label>
        <label className="block text-sm">
          Mobile number
          <input
            name="phone"
            {...a11y("phone")}
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            className={field}
          />
          {err("phone")}
        </label>
        <label className="block text-sm">
          Email
          <input
            name="email"
            {...a11y("email")}
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            className={field}
          />
          {err("email")}
        </label>
        <label className="block text-sm sm:col-span-2">
          Preferred language for the call
          <select
            name="language"
            {...a11y("language")}
            required
            defaultValue="en-IN"
            className={field}
          >
            {languages.map((l) => (
              <option key={l.value} value={l.value} className="text-ink">
                {l.label}
              </option>
            ))}
          </select>
          {err("language")}
        </label>
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="mt-5 empty:hidden">{live}</div>

      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-[color-mix(in_oklch,var(--color-accent),black_15%)] text-on-accent hover:bg-accent-bright hover:text-ink mt-6 flex min-h-12 w-full items-center justify-center rounded-full px-7 font-medium transition-colors disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Request a demo"}
      </button>
      <p className="text-dark-muted mt-4 text-xs">
        We use your details only to contact you about Muxaris. See our privacy policy.
      </p>
    </form>
  );
}
