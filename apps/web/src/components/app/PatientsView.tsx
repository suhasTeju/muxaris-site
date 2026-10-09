"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import type { Patient } from "@muxaris/shared";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  TableHead,
  TableRow,
  cn,
  useToast,
} from "@/components/ui";
import { languageLabel } from "@/lib/dashboard";
import { useCoreApi } from "./core/api";
import { formatDayShort, initials } from "./core/format";
import { PatientForm } from "./PatientForm";

const PAGE = 50;
const COLUMNS = "minmax(0,1.4fr) 170px 110px minmax(0,1.2fr) 110px";

function PatientRow({ p, tz }: { p: Patient; tz: string }) {
  return (
    <TableRow columns={COLUMNS} href={`/app/patients/${p.id}`}>
      <span className="flex min-w-0 items-center gap-[10px]">
        <span
          aria-hidden
          className={cn(
            "grid size-[30px] shrink-0 place-items-center rounded-full text-[12px] font-semibold",
            p.name ? "bg-teal-soft text-teal-ink" : "bg-chip text-muted-2",
          )}
        >
          {initials(p.name)}
        </span>
        <span className={cn("truncate font-medium", !p.name && "text-muted-2")}>
          {p.name ?? "Unnamed"}
        </span>
      </span>
      <span className="text-ink-2 font-mono text-[12.5px]">{p.phoneMasked}</span>
      <span className="text-ink-2">{languageLabel(p.preferredLanguage)}</span>
      <span className="text-muted truncate">{p.email ?? "—"}</span>
      <span className="text-muted font-mono text-[12.5px]">{formatDayShort(p.createdAt, tz)}</span>
    </TableRow>
  );
}

/**
 * Patients list from AppPatients.dc.html. The server renders the unfiltered first page; the search
 * term stays in component state only (never the URL), because it can be a phone number, email or
 * name.
 */
export function PatientsView({
  initial,
  initialTotal,
  tz,
  initialAdding = false,
}: {
  initial: Patient[];
  initialTotal: number;
  tz: string;
  /** Open the Add patient dialog on mount (dev previews). */
  initialAdding?: boolean;
}) {
  const api = useCoreApi();
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(initialAdding);
  const seq = useRef(0);
  // The term the list on screen was fetched for; the server rendered the unfiltered first page.
  const shown = useRef("");

  const fetchPage = useCallback(
    async (query: string, offset: number) => {
      const id = ++seq.current;
      setBusy(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
        if (query) qs.set("q", query);
        const r = await api<{ patients: Patient[]; total: number }>(`/v1/patients?${qs}`);
        if (id !== seq.current) return;
        setItems((prev) => {
          if (offset === 0) return r.patients;
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...r.patients.filter((p) => !seen.has(p.id))];
        });
        setTotal(r.total);
      } catch (e) {
        if (id === seq.current)
          setError(e instanceof Error ? e.message : "Could not load patients");
      } finally {
        if (id === seq.current) setBusy(false);
      }
    },
    [api],
  );

  // Debounced search: refetch from the first page whenever the trimmed term changes.
  useEffect(() => {
    const term = q.trim();
    if (term === shown.current) return;
    const t = setTimeout(() => {
      shown.current = term;
      void fetchPage(term, 0);
    }, 300);
    return () => clearTimeout(t);
  }, [q, fetchPage]);

  return (
    <div className="animate-mx-in flex flex-col gap-[18px]">
      <PageHeader
        title="Patients"
        subtitle={`${initialTotal} ${initialTotal === 1 ? "patient" : "patients"}`}
        actions={
          <Button icon={UserPlus} onClick={() => setAdding(true)}>
            Add patient
          </Button>
        }
      />
      <label className="relative flex max-w-[420px] items-center">
        <span className="sr-only">Search patients</span>
        <Input
          type="search"
          icon={Search}
          className="rounded-10 pr-[12px] text-[14.5px]"
          placeholder="Name, phone or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-rose m-0 flex items-center gap-[10px] text-[13.5px]">
          {error}
          <Button variant="secondary" size={28} onClick={() => fetchPage(q.trim(), 0)}>
            Retry
          </Button>
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyState size="sm">
          {q.trim()
            ? "No patients match that search."
            : "No patients yet. They are added automatically when the assistant books an appointment."}
        </EmptyState>
      ) : (
        <Card aria-label="Patients" className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <TableHead columns={COLUMNS}>
                <span>Name</span>
                <span>Phone</span>
                <span>Language</span>
                <span>Email</span>
                <span>Added</span>
              </TableHead>
              {items.map((p) => (
                <PatientRow key={p.id} p={p} tz={tz} />
              ))}
            </div>
          </div>
        </Card>
      )}
      {items.length < total ? (
        <Button
          variant="secondary"
          size={36}
          className="self-start"
          disabled={busy}
          onClick={() => fetchPage(q.trim(), items.length)}
        >
          {busy ? "Loading…" : "Load more"}
        </Button>
      ) : null}
      {adding ? (
        <PatientForm
          mode="create"
          onCancel={() => setAdding(false)}
          onSaved={(p) => {
            toast("Patient added");
            router.push(`/app/patients/${p.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
