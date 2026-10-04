"use client";

import { useEffect, useState } from "react";
import { serviceBody, slotRulesBody } from "@muxaris/shared";
import { DENTAL_SERVICE_DEFAULTS, type ServiceDraft } from "@/lib/onboarding";
import { Btn, Check, ErrorNote, StepShell, TextField, errMsg, type Call } from "./ui";

interface Row extends ServiceDraft {
  key: number;
  selected: boolean;
  saved?: boolean;
}

let seq = 0;
const num = (v: string) => (v === "" ? Number.NaN : Number(v));

export function StepServices({
  call,
  onBack,
  onContinue,
}: {
  call: Call;
  onBack: () => Promise<void>;
  onContinue: () => Promise<void>;
}) {
  const [existing, setExisting] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>(() =>
    DENTAL_SERVICE_DEFAULTS.map((s) => ({ ...s, key: ++seq, selected: true })),
  );
  const [rules, setRules] = useState({
    slotGrainMin: 15,
    leadTimeMin: 60,
    maxDaysAhead: 60,
    allowSameDay: true,
  });
  const [rowErr, setRowErr] = useState<Record<number, string>>({});
  const [ruleErr, setRuleErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    call<{ services: Array<{ name: string }> }>("/v1/services")
      .then((r) => {
        if (!live || !r.services.length) return;
        const names = new Set(r.services.map((s) => s.name.toLowerCase()));
        setExisting(r.services.map((s) => s.name));
        setRows((rs) =>
          rs.map((x) => ({ ...x, selected: x.selected && !names.has(x.name.toLowerCase()) })),
        );
      })
      .catch(() => undefined);
    call<{ slotRules: typeof rules | null }>("/v1/slot-rules")
      .then((r) => {
        if (!live || !r.slotRules) return;
        const { slotGrainMin, leadTimeMin, maxDaysAhead, allowSameDay } = r.slotRules;
        setRules({ slotGrainMin, leadTimeMin, maxDaysAhead, allowSameDay });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [call]);

  const patch = (key: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p, saved: false } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const chosen = rows.filter((r) => r.selected);
    if (chosen.length === 0 && existing.length === 0) {
      setError("Pick at least one service.");
      return;
    }
    const errs: Record<number, string> = {};
    for (const r of chosen) {
      const p = serviceBody.safeParse({
        name: r.name,
        durationMin: r.durationMin,
        bufferMin: r.bufferMin,
        priceInr: r.priceInr,
        bookableByAi: r.bookableByAi,
      });
      if (!p.success)
        errs[r.key] = "Name, a positive duration, and non-negative buffer and price are required";
    }
    setRowErr(errs);
    const rp = slotRulesBody.safeParse(rules);
    setRuleErr(
      rp.success
        ? null
        : "Check the booking rules: grain 5 to 60, lead time up to 1440, days ahead 1 to 365",
    );
    if (Object.keys(errs).length || !rp.success) return;

    setBusy(true);
    try {
      for (const r of chosen) {
        if (r.saved) continue;
        await call("/v1/services", {
          method: "POST",
          body: {
            name: r.name.trim(),
            durationMin: r.durationMin,
            bufferMin: r.bufferMin,
            priceInr: r.priceInr,
            bookableByAi: r.bookableByAi,
          },
        });
        setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, saved: true } : x)));
      }
      await call("/v1/slot-rules", { method: "PUT", body: rp.data });
      await onContinue();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepShell
        title="What do you offer?"
        lead="Tick what you provide. The assistant quotes these durations and prices."
        footer={
          <>
            <Btn variant="ghost" onClick={() => void onBack()}>
              Back
            </Btn>
            <Btn type="submit" busy={busy}>
              Continue
            </Btn>
          </>
        }
      >
        {existing.length ? (
          <p className="text-muted text-sm">Already added: {existing.join(", ")}.</p>
        ) : null}
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="border-line rounded-xl border p-4">
              <div className="grid items-end gap-3 sm:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
                <div>
                  <Check
                    label="Offer"
                    checked={r.selected}
                    onChange={(e) => patch(r.key, { selected: e.target.checked })}
                  />
                  <TextField
                    label="Service"
                    value={r.name}
                    disabled={!r.selected}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                  />
                </div>
                <TextField
                  label="Minutes"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  value={Number.isNaN(r.durationMin) ? "" : r.durationMin}
                  disabled={!r.selected}
                  onChange={(e) => patch(r.key, { durationMin: num(e.target.value) })}
                />
                <TextField
                  label="Buffer (min)"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={Number.isNaN(r.bufferMin) ? "" : r.bufferMin}
                  disabled={!r.selected}
                  onChange={(e) => patch(r.key, { bufferMin: num(e.target.value) })}
                />
                <TextField
                  label="Price (₹)"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={Number.isNaN(r.priceInr) ? "" : r.priceInr}
                  disabled={!r.selected}
                  onChange={(e) => patch(r.key, { priceInr: num(e.target.value) })}
                />
              </div>
              <Check
                label="Assistant can book this"
                checked={r.bookableByAi}
                disabled={!r.selected}
                onChange={(e) => patch(r.key, { bookableByAi: e.target.checked })}
              />
              {rowErr[r.key] ? (
                <p role="alert" className="text-danger text-sm">
                  {rowErr[r.key]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <Btn
          variant="secondary"
          onClick={() =>
            setRows((rs) => [
              ...rs,
              {
                key: ++seq,
                selected: true,
                name: "",
                durationMin: 30,
                bufferMin: 5,
                priceInr: 0,
                bookableByAi: true,
              },
            ])
          }
        >
          Add a service
        </Btn>

        <fieldset className="border-line space-y-5 rounded-xl border p-4 sm:p-5">
          <legend className="text-ink px-1 text-sm font-medium">Booking rules</legend>
          <div className="grid gap-5 sm:grid-cols-3">
            <TextField
              label="Slot length (min)"
              type="number"
              inputMode="numeric"
              value={Number.isNaN(rules.slotGrainMin) ? "" : rules.slotGrainMin}
              onChange={(e) => setRules({ ...rules, slotGrainMin: num(e.target.value) })}
            />
            <TextField
              label="Notice needed (min)"
              type="number"
              inputMode="numeric"
              value={Number.isNaN(rules.leadTimeMin) ? "" : rules.leadTimeMin}
              onChange={(e) => setRules({ ...rules, leadTimeMin: num(e.target.value) })}
            />
            <TextField
              label="Book up to (days ahead)"
              type="number"
              inputMode="numeric"
              value={Number.isNaN(rules.maxDaysAhead) ? "" : rules.maxDaysAhead}
              onChange={(e) => setRules({ ...rules, maxDaysAhead: num(e.target.value) })}
            />
          </div>
          <Check
            label="Allow same-day bookings"
            checked={rules.allowSameDay}
            onChange={(e) => setRules({ ...rules, allowSameDay: e.target.checked })}
          />
          {ruleErr ? (
            <p role="alert" className="text-danger text-sm">
              {ruleErr}
            </p>
          ) : null}
        </fieldset>
        <ErrorNote message={error} />
      </StepShell>
    </form>
  );
}
