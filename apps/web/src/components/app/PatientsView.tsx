"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Patient } from "@muxaris/shared";
import { useApi } from "@/lib/api-client";
import { formatDay, languageLabel } from "@/lib/dashboard";
import { EmptyState } from "./EmptyState";
import { fieldClass, ghostBtn, Modal, primaryBtn } from "./Modal";
import { PatientForm } from "./PatientForm";

const PAGE = 50;

/**
 * Searchable patient list. The server renders the unfiltered first page; the search term stays in
 * component state only (never the URL), because it can be a phone number, email or name.
 */
export function PatientsView({
  initial,
  initialTotal,
  tz,
}: {
  initial: Patient[];
  initialTotal: number;
  tz: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const seq = useRef(0);
  const first = useRef(true);

  async function fetchPage(query: string, offset: number) {
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
      if (id === seq.current) setError(e instanceof Error ? e.message : "Could not load patients");
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }

  // Debounced search: refetch from the first page.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      void fetchPage(q.trim(), 0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <label htmlFor="patient-search" className="text-muted">
            Search patients
          </label>
          <input
            id="patient-search"
            type="search"
            className={fieldClass}
            placeholder="Name, phone or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button type="button" className={primaryBtn} onClick={() => setAdding(true)}>
          Add patient
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-danger mb-3 text-sm">
          {error}{" "}
          <button type="button" className="underline" onClick={() => fetchPage(q.trim(), 0)}>
            Retry
          </button>
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyState>
          {q.trim()
            ? "No patients match that search."
            : "No patients yet. They are added automatically when the assistant books an appointment."}
        </EmptyState>
      ) : (
        <div className="border-line bg-surface rounded-card overflow-x-auto border">
          <table className="w-full text-left text-[15px]">
            <thead className="text-muted text-sm">
              <tr>
                <th scope="col" className="px-3 py-2 font-normal">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Phone
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Language
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Email
                </th>
                <th scope="col" className="px-3 py-2 font-normal">
                  Added
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-line border-t">
                  <td className="px-3 py-3">
                    <Link
                      href={`/app/patients/${p.id}`}
                      className="text-accent-deep font-medium underline-offset-4 hover:underline"
                    >
                      {p.name ?? "Unnamed"}
                    </Link>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{p.phoneMasked}</td>
                  <td className="px-3 py-3">{languageLabel(p.preferredLanguage)}</td>
                  <td className="px-3 py-3">{p.email ?? "—"}</td>
                  <td className="text-muted px-3 py-3 whitespace-nowrap">
                    {formatDay(p.createdAt, tz)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length < total ? (
        <button
          type="button"
          className={`${ghostBtn} mt-4`}
          disabled={busy}
          onClick={() => fetchPage(q.trim(), items.length)}
        >
          {busy ? "Loading…" : "Load more"}
        </button>
      ) : null}
      {adding ? (
        <Modal title="Add patient" onClose={() => setAdding(false)}>
          <PatientForm
            mode="create"
            onCancel={() => setAdding(false)}
            onSaved={(p) => router.push(`/app/patients/${p.id}`)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
