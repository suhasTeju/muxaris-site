"use client";

import { useId, useState } from "react";
import { LANGUAGES, indianPhone, type Patient } from "@muxaris/shared";
import { Button, Field, Input, Modal, Select, Textarea, cn } from "@/components/ui";
import { useCoreApi } from "./core/api";

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

export const PHONE_ERROR = "Enter a 10-digit Indian mobile number, for example 98765 43210.";

/** Inputs sit inside 500-weight #2c3646 labels in the design and inherit both. */
const control = "font-medium text-ink-2";

/**
 * Create or edit a patient. Create is the design's "Add patient" dialog (two-column grid, footer
 * buttons); edit is the single column that replaces the details on the patient card. Edit sends
 * only the fields that changed; cleared text becomes null.
 */
export function PatientForm(props: Props) {
  const api = useCoreApi();
  const formId = useId();
  const initial: Initial =
    props.mode === "edit"
      ? props.initial
      : { name: null, email: null, preferredLanguage: "en-IN", dob: null, notes: null };
  const [phone, setPhone] = useState("");
  const [phoneBad, setPhoneBad] = useState(false);
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [language, setLanguage] = useState(initial.preferredLanguage);
  const [dob, setDob] = useState(initial.dob ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (props.mode === "create" && !indianPhone.safeParse(phone).success) {
      setPhoneBad(true);
      return;
    }
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

  const create = props.mode === "create";
  const alert = error ? (
    <p role="alert" className={cn("text-rose m-0 text-[13px]", create && "col-span-full")}>
      {error}
    </p>
  ) : null;
  const fields = (
    <>
      {create ? (
        <Field label="Phone" error={phoneBad ? PHONE_ERROR : undefined}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            required
            className={control}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneBad(false);
            }}
          />
        </Field>
      ) : null}
      <Field label="Name">
        <Input
          className={control}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          className={control}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Language">
        <Select className={control} value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date of birth">
        <Input
          type="date"
          className={control}
          value={dob}
          onChange={(e) => setDob(e.target.value)}
        />
      </Field>
      <Field label="Notes" className={create ? "col-span-full" : undefined}>
        <Textarea
          className={control}
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
    </>
  );

  if (create) {
    return (
      <Modal
        title="Add patient"
        width={520}
        onClose={props.onCancel}
        // The design's header is 20/22/12 and the body starts 6px lower.
        className="[&>div:first-child]:pb-[12px] [&>div:nth-child(2)]:pt-[6px]"
        footer={
          <>
            <Button variant="secondary" size={40} onClick={props.onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              size={40}
              className="px-[18px] shadow-none"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          noValidate
          onSubmit={submit}
          className="grid grid-cols-1 gap-[12px] sm:grid-cols-2"
        >
          {fields}
          {alert}
        </form>
      </Modal>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[12px]">
      {fields}
      {alert}
      <div className="flex gap-[8px]">
        <Button variant="secondary" size={38} className="flex-1" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" size={38} className="flex-1 shadow-none" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
