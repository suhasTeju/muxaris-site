"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Service } from "@muxaris/shared";
import { Button, Input, Switch, TableHead, useToast } from "@/components/ui";
import { useApi } from "@/lib/api-client";
import { rupee, saveErrorText } from "./format";
import {
  EditActions,
  OwnerOnlyNote,
  SectionEmpty,
  SectionError,
  SettingsSection,
} from "./settings-ui";

const COLUMNS = "minmax(0,1fr) 100px 100px 100px 120px 36px";

interface Row {
  key: string;
  id: string | null;
  name: string;
  durationMin: string;
  bufferMin: string;
  priceInr: string;
  bookableByAi: boolean;
}

let nextKey = 0;
const toRow = (s: Service): Row => ({
  key: s.id,
  id: s.id,
  name: s.name,
  durationMin: String(s.durationMin),
  bufferMin: String(s.bufferMin),
  priceInr: s.priceInr == null ? "" : String(s.priceInr),
  bookableByAi: s.bookableByAi,
});

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

/** Field values a row would save, or a message when one is out of range. */
function parseRow(r: Row) {
  const durationMin = int(r.durationMin);
  const bufferMin = r.bufferMin.trim() ? int(r.bufferMin) : 0;
  const priceInr = r.priceInr.trim() ? int(r.priceInr) : null;
  if (!r.name.trim()) return { error: "Give every service a name." };
  if (!(durationMin >= 5 && durationMin <= 480))
    return { error: `${r.name.trim()}: duration must be 5 to 480 minutes.` };
  if (!(bufferMin >= 0 && bufferMin <= 120))
    return { error: `${r.name.trim()}: buffer must be 0 to 120 minutes.` };
  if (priceInr !== null && !(priceInr >= 0 && priceInr <= 1_000_000))
    return { error: `${r.name.trim()}: enter a price in whole rupees.` };
  return {
    value: {
      name: r.name.trim(),
      durationMin,
      bufferMin,
      priceInr,
      bookableByAi: r.bookableByAi,
    },
  };
}

/**
 * Settings → Services: the active services as a table; owners edit them all at once. Save PATCHes
 * changed rows, POSTs new ones and deactivates removed ones (services are never deleted, because
 * appointments point at them).
 */
export function ServicesSection({
  services,
  isOwner,
  onChange,
}: {
  /** Active services only. */
  services: Service[];
  isOwner: boolean;
  /** Called with each created, edited or deactivated service as it saves. */
  onChange: (service: Service) => void;
}) {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function cancel() {
    setRows(null);
    setError(null);
  }

  async function save() {
    if (!rows) return;
    // Blank rows that were never saved are dropped, as the design does.
    const kept = rows.filter((r) => r.id || r.name.trim());
    const parsed = kept.map((r) => ({ row: r, ...parseRow(r) }));
    const bad = parsed.find((p) => p.error);
    if (bad) {
      setError(bad.error!);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const keptIds = new Set(kept.map((r) => r.id));
      for (const s of services) {
        if (keptIds.has(s.id)) continue;
        const r = await api<{ service: Service }>(`/v1/services/${encodeURIComponent(s.id)}`, {
          method: "PATCH",
          body: { active: false },
        });
        onChange(r.service);
      }
      for (const { row, value } of parsed) {
        if (!value) continue;
        if (!row.id) {
          const r = await api<{ service: Service }>("/v1/services", {
            method: "POST",
            body: value,
          });
          setRow(row.key, { id: r.service.id });
          onChange(r.service);
          continue;
        }
        const was = services.find((s) => s.id === row.id);
        if (!was) continue;
        const patch = Object.fromEntries(
          Object.entries(value).filter(([k, v]) => was[k as keyof typeof value] !== v),
        );
        if (!Object.keys(patch).length) continue;
        const r = await api<{ service: Service }>(`/v1/services/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          body: patch,
        });
        onChange(r.service);
      }
      setRows(null);
      toast("Services saved");
    } catch (e) {
      setError(saveErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const editing = rows !== null;
  const list = rows ?? services.map(toRow);
  return (
    <SettingsSection
      id="set-services"
      title="Services"
      aside={
        isOwner ? (
          <EditActions
            editing={editing}
            busy={busy}
            label="services"
            onEdit={() => setRows(services.map(toRow))}
            onCancel={cancel}
            onSave={() => void save()}
          />
        ) : (
          <OwnerOnlyNote />
        )
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <TableHead columns={COLUMNS} gap={12} inset={20} className="border-chip">
            <span>Service</span>
            <span>Duration</span>
            <span>Buffer</span>
            <span>Price</span>
            <span>Assistant books</span>
            <span />
          </TableHead>
          {list.map((r) => (
            <div
              key={r.key}
              className="border-line-soft grid items-center gap-x-[12px] border-t px-[20px] py-[10px] text-[14px]"
              style={{ gridTemplateColumns: COLUMNS }}
            >
              {editing ? (
                <>
                  <Input
                    size={34}
                    aria-label="Service"
                    value={r.name}
                    onChange={(e) => setRow(r.key, { name: e.target.value })}
                  />
                  {(
                    [
                      ["durationMin", "Duration (min)"],
                      ["bufferMin", "Buffer (min)"],
                      ["priceInr", "Price (₹)"],
                    ] as const
                  ).map(([k, label]) => (
                    <Input
                      key={k}
                      size={34}
                      mono
                      type="number"
                      min={0}
                      aria-label={label}
                      value={r[k]}
                      onChange={(e) => setRow(r.key, { [k]: e.target.value })}
                      className="px-[8px]"
                    />
                  ))}
                  <Switch
                    size={22}
                    checked={r.bookableByAi}
                    onCheckedChange={(v) => setRow(r.key, { bookableByAi: v })}
                    aria-label="Assistant can book this"
                  />
                  <Button
                    variant="danger-ghost"
                    size={32}
                    iconOnly
                    icon={Trash2}
                    iconSize={14}
                    aria-label="Remove service"
                    onClick={() => setRows((rs) => rs && rs.filter((x) => x.key !== r.key))}
                  />
                </>
              ) : (
                <>
                  <span className="font-medium">{r.name}</span>
                  <span className="font-mono text-[13px]">{r.durationMin} min</span>
                  <span className="text-muted font-mono text-[13px]">{r.bufferMin} min</span>
                  <span className="font-mono text-[13px]">
                    {r.priceInr ? rupee(Number(r.priceInr)) : "-"}
                  </span>
                  <span
                    className={
                      r.bookableByAi ? "text-green-ink text-[13px]" : "text-muted text-[13px]"
                    }
                  >
                    {r.bookableByAi ? "Yes" : "No"}
                  </span>
                  <span />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {editing ? (
        <div className="border-line-soft border-t px-[20px] py-[12px]">
          <Button
            variant="dashed"
            size={34}
            icon={Plus}
            iconSize={13}
            className="text-[13px]"
            onClick={() =>
              setRows((rs) => [
                ...(rs ?? []),
                {
                  key: `new-${++nextKey}`,
                  id: null,
                  name: "",
                  durationMin: "30",
                  bufferMin: "5",
                  priceInr: "0",
                  bookableByAi: true,
                },
              ])
            }
          >
            Add a service
          </Button>
        </div>
      ) : null}
      {list.length === 0 ? <SectionEmpty>No services added yet.</SectionEmpty> : null}
      {error ? <SectionError>{error}</SectionError> : null}
    </SettingsSection>
  );
}
