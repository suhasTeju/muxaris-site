"use client";

import { useEffect, useState } from "react";
import { serviceBody, slotRulesBody } from "@muxaris/shared";
import { DENTAL_SERVICE_DEFAULTS, type ServiceDraft } from "@/lib/onboarding";
import { Plus } from "lucide-react";
import { Button, Input, Switch, TableHead, TableRow, cn } from "@/components/ui";
import {
  CheckBox,
  CheckRow,
  StepFooter,
  StepShell,
  StepSubheading,
  TextField,
  errMsg,
  useStepBusy,
  type Call,
} from "./ui";

interface Row extends ServiceDraft {
  key: number;
  selected: boolean;
  saved?: boolean;
}

let seq = 0;
const num = (v: string) => (v === "" ? Number.NaN : Number(v));
const shown = (n: number) => (Number.isNaN(n) ? "" : n);

/** Offer · Service name · Minutes · Buffer · Price · Assistant can book this. */
const COLUMNS = "56px minmax(0,1fr) 84px 92px 100px 110px";
const ROW_ERROR = "Name, a positive duration, and non-negative buffer and price are required";
const RULES_ERROR =
  "Check the booking rules: grain 5 to 60, lead time up to 1440, days ahead 1 to 365";

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
  const [rowErr, setRowErr] = useState<Record<number, true>>({});
  const [ruleErr, setRuleErr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useStepBusy(false);

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
    setRows((rs) => rs.map((r) => (r.key === key && !r.saved ? { ...r, ...p } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const chosen = rows.filter((r) => r.selected);
    if (chosen.length === 0 && existing.length === 0) {
      setError("Pick at least one service.");
      return;
    }
    const errs: Record<number, true> = {};
    for (const r of chosen) {
      const p = serviceBody.safeParse({
        name: r.name,
        durationMin: r.durationMin,
        bufferMin: r.bufferMin,
        priceInr: r.priceInr,
        bookableByAi: r.bookableByAi,
      });
      if (!p.success) errs[r.key] = true;
    }
    setRowErr(errs);
    const rp = slotRulesBody.safeParse(rules);
    setRuleErr(rp.success ? null : RULES_ERROR);
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

  const anySaved = rows.some((r) => r.saved);
  const stepError = error ?? (Object.keys(rowErr).length ? ROW_ERROR : ruleErr);

  return (
    <form onSubmit={submit} noValidate>
      <StepShell
        title="What do you offer?"
        lead="Tick what you provide. The assistant quotes these durations and prices."
        error={stepError}
        gap="gap-[24px]"
        footer={<StepFooter onBack={() => void onBack()} busy={busy} />}
      >
        {existing.length ? (
          <p className="text-muted m-0 text-[13.5px]">Already added: {existing.join(", ")}</p>
        ) : null}
        <div className="border-line overflow-x-auto rounded-16 border">
          <div className="min-w-[620px]">
            <TableHead
              columns={COLUMNS}
              gap={10}
              className="bg-subtle items-center px-[14px] py-[10px]"
            >
              <span>Offer</span>
              <span>Service name</span>
              <span>Minutes</span>
              <span>Buffer (min)</span>
              <span>Price (₹)</span>
              <span>Assistant can book this</span>
            </TableHead>
            {rows.map((r) => {
              const locked = !r.selected || Boolean(r.saved);
              const bad = Boolean(rowErr[r.key]);
              // Unticked rows fade as a whole (opacity .6); only saved rows dim their own controls.
              const still = r.saved ? undefined : "disabled:opacity-100";
              return (
                <TableRow
                  key={r.key}
                  columns={COLUMNS}
                  gap={10}
                  className={cn(
                    "border-chip px-[14px] py-[8px]",
                    r.selected ? "bg-surface" : "bg-surface-2 opacity-60",
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={r.selected}
                    aria-label="Offer"
                    disabled={Boolean(r.saved)}
                    onClick={() => patch(r.key, { selected: !r.selected })}
                    className="w-fit cursor-pointer border-0 bg-transparent p-0 disabled:cursor-default"
                  >
                    <CheckBox on={r.selected} size={20} />
                  </button>
                  <Input
                    size={36}
                    aria-label="Service name"
                    invalid={bad}
                    disabled={locked}
                    value={r.name}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                    className={cn("px-[10px] text-[14px]", still)}
                  />
                  <Input
                    size={36}
                    mono
                    type="number"
                    inputMode="numeric"
                    min={5}
                    aria-label="Minutes"
                    invalid={bad}
                    disabled={locked}
                    value={shown(r.durationMin)}
                    onChange={(e) => patch(r.key, { durationMin: num(e.target.value) })}
                    className={cn("text-[13.5px]", still)}
                  />
                  <Input
                    size={36}
                    mono
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label="Buffer (min)"
                    invalid={bad}
                    disabled={locked}
                    value={shown(r.bufferMin)}
                    onChange={(e) => patch(r.key, { bufferMin: num(e.target.value) })}
                    className={cn("text-[13.5px]", still)}
                  />
                  <Input
                    size={36}
                    mono
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label="Price (₹)"
                    invalid={bad}
                    disabled={locked}
                    value={shown(r.priceInr)}
                    onChange={(e) => patch(r.key, { priceInr: num(e.target.value) })}
                    className={cn("text-[13.5px]", still)}
                  />
                  <Switch
                    size={22}
                    aria-label="Assistant can book this"
                    checked={r.bookableByAi}
                    disabled={locked}
                    onCheckedChange={(v) => patch(r.key, { bookableByAi: v })}
                    className={still}
                  />
                </TableRow>
              );
            })}
          </div>
        </div>
        <Button
          variant="secondary"
          size={38}
          icon={Plus}
          iconSize={14}
          className="self-start"
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
        </Button>
        {anySaved ? (
          <p className="text-muted m-0 mt-[-12px] text-[13px]">Saved. Edit later in Settings.</p>
        ) : null}

        <div className="border-line flex flex-col gap-[14px] border-t pt-[22px]">
          <StepSubheading>Booking rules</StepSubheading>
          <div className="grid gap-[14px] sm:grid-cols-3">
            <TextField
              label="Slot length (min)"
              type="number"
              inputMode="numeric"
              mono
              invalid={Boolean(ruleErr)}
              value={shown(rules.slotGrainMin)}
              onChange={(e) => setRules({ ...rules, slotGrainMin: num(e.target.value) })}
            />
            <TextField
              label="Notice needed (min)"
              type="number"
              inputMode="numeric"
              mono
              invalid={Boolean(ruleErr)}
              value={shown(rules.leadTimeMin)}
              onChange={(e) => setRules({ ...rules, leadTimeMin: num(e.target.value) })}
            />
            <TextField
              label="Book up to (days ahead)"
              type="number"
              inputMode="numeric"
              mono
              invalid={Boolean(ruleErr)}
              value={shown(rules.maxDaysAhead)}
              onChange={(e) => setRules({ ...rules, maxDaysAhead: num(e.target.value) })}
            />
          </div>
          <CheckRow
            on={rules.allowSameDay}
            onToggle={() => setRules({ ...rules, allowSameDay: !rules.allowSameDay })}
            className="self-start text-[14.5px]"
          >
            Allow same-day bookings
          </CheckRow>
        </div>
      </StepShell>
    </form>
  );
}
