"use client";

import { useState, type FormEvent } from "react";
import { env } from "@/lib/env";

interface Option {
  value: string;
  label: string;
}
type Status = "idle" | "sending" | "done" | "error";

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch(`${env.apiUrl}/v1/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setStatus("done");
        return;
      }
      setStatus("error");
      if (res.status === 429) {
        setMessage("That’s a lot of requests from your network. Please try again in an hour.");
      } else if (res.status === 400) {
        setMessage("Please check your phone number (10-digit Indian mobile) and email address.");
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

  if (status === "done") {
    return (
      <div
        role="status"
        className="rounded-3xl border border-accent-bright/40 bg-white/[0.05] p-8 sm:p-10"
      >
        <p className="font-display text-3xl tracking-tight">Thank you. We have your request.</p>
        <p className="text-dark-muted mt-3 leading-relaxed">
          Someone from Muxaris will call or email you within one working day to set up your demo.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm">
          Your name
          <input name="name" required maxLength={120} autoComplete="name" className={field} />
        </label>
        <label className="block text-sm">
          Clinic name
          <input
            name="clinic"
            required
            maxLength={160}
            autoComplete="organization"
            className={field}
          />
        </label>
        <label className="block text-sm">
          City
          <select name="city" required defaultValue="" className={field}>
            <option value="" disabled>
              Select city
            </option>
            {cities.map((c) => (
              <option key={c} value={c} className="text-ink">
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Specialty
          <select name="specialty" required defaultValue="dental" className={field}>
            {specialties.map((s) => (
              <option key={s.value} value={s.value} className="text-ink">
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Mobile number
          <input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            className={field}
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            className={field}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Preferred language for the call
          <select name="language" required defaultValue="en-IN" className={field}>
            {languages.map((l) => (
              <option key={l.value} value={l.value} className="text-ink">
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {status === "error" && (
        <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-accent text-on-accent hover:bg-accent-bright hover:text-ink mt-6 flex min-h-12 w-full items-center justify-center rounded-full px-7 font-medium transition-colors disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Request a demo"}
      </button>
      <p className="text-dark-muted mt-4 text-xs">
        We use your details only to contact you about Muxaris. See our privacy policy.
      </p>
    </form>
  );
}
