"use client";

import { useState } from "react";
import { LANGUAGES, type Patient } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { fieldClass, ghostBtn, primaryBtn } from "./Modal";

type Initial = Pick<Patient, "name" | "email" | "preferredLanguage" | "dob" | "notes">;
type Props =
  | { mode: "create"; onSaved: (p: { id: string }) => void; onCancel: () => void }
  | {
      mode: "edit";
      patientId: string;
      initial: Initial;
      onSaved: (p: { id: string }) => void;
      onCancel: () => void;
    };

/** Create or edit a patient. Edit sends only the fields that changed; cleared text becomes null. */
export function PatientForm(props: Props) {
  const api = useApi();
  const initial: Initial =
    props.mode === "edit"
      ? props.initial
      : { name: null, email: null, preferredLanguage: "en-IN", dob: null, notes: null };
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [language, setLanguage] = useState(initial.preferredLanguage);
  const [dob, setDob] = useState(initial.dob ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (props.mode === "create") {
        body.phone = phone.trim();
        if (name.trim()) body.name = name.trim();
        if (email.trim()) body.email = email.trim();
        body.preferredLanguage = language;
        if (dob) body.dob = dob;
        if (notes.trim()) body.notes = notes.trim();
        const r = await api<{ patient: { id: string } }>("/v1/patients", {
          method: "POST",
          body,
        });
        props.onSaved(r.patient);
      } else {
        if (name.trim() !== (initial.name ?? "")) body.name = name.trim() || null;
        if (email.trim() !== (initial.email ?? "")) body.email = email.trim() || null;
        if (language !== initial.preferredLanguage) body.preferredLanguage = language;
        if (dob !== (initial.dob ?? "")) body.dob = dob || null;
        if (notes.trim() !== (initial.notes ?? "")) body.notes = notes.trim() || null;
        if (Object.keys(body).length === 0) {
          props.onCancel();
          return;
        }
        const r = await api<{ patient: { id: string } }>(
          `/v1/patients/${encodeURIComponent(props.patientId)}`,
          { method: "PATCH", body },
        );
        props.onSaved(r.patient);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the patient");
    } finally {
      setBusy(false);
    }
  }

  const label = "flex flex-col gap-1 text-sm";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {props.mode === "create" ? (
        <div className={label}>
          <label htmlFor="pf-phone" className="text-muted">
            Phone
          </label>
          <input
            id="pf-phone"
            className={fieldClass}
            inputMode="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      ) : null}
      <div className={label}>
        <label htmlFor="pf-name" className="text-muted">
          Name
        </label>
        <input
          id="pf-name"
          className={fieldClass}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={label}>
        <label htmlFor="pf-email" className="text-muted">
          Email
        </label>
        <input
          id="pf-email"
          type="email"
          className={fieldClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className={label}>
        <label htmlFor="pf-language" className="text-muted">
          Language
        </label>
        <select
          id="pf-language"
          className={fieldClass}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div className={label}>
        <label htmlFor="pf-dob" className="text-muted">
          Date of birth
        </label>
        <input
          id="pf-dob"
          type="date"
          className={fieldClass}
          value={dob}
          onChange={(e) => setDob(e.target.value)}
        />
      </div>
      <div className={label}>
        <label htmlFor="pf-notes" className="text-muted">
          Notes
        </label>
        <textarea
          id="pf-notes"
          className={`${fieldClass} py-2`}
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <button type="button" className={ghostBtn} onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit" className={primaryBtn} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
