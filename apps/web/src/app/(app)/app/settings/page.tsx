import Link from "next/link";
import type { AssistantProfile, Clinic, Doctor, Service, SlotRules } from "@muxaris/shared";
import { LANGUAGES } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { requireActiveClinic, serverApi } from "@/lib/api-server";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-surface rounded-card border p-5">
      <h2 className="font-display mb-3 text-xl">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[15px]">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const active = await requireActiveClinic();
  const assistantReq = serverApi<{ assistant: AssistantProfile }>("/v1/assistant").catch((e) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
  const [{ clinic }, doctors, services, rules, assistant] = await Promise.all([
    serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`),
    serverApi<{ doctors: Doctor[] }>("/v1/doctors"),
    serverApi<{ services: Service[] }>("/v1/services"),
    serverApi<{ slotRules: SlotRules }>("/v1/slot-rules"),
    assistantReq,
  ]);
  const langs = clinic.languages
    .map((c) => LANGUAGES.find((l) => l.code === c)?.label ?? c)
    .join(", ");

  return (
    <div className="max-w-3xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl">Settings</h1>
        <Link
          href="/onboarding"
          className="border-line inline-flex min-h-11 items-center rounded-xl border px-4 text-[15px] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          Edit in onboarding
        </Link>
      </div>
      <div className="flex flex-col gap-5">
        <Section title="Clinic">
          <dl>
            <Row k="Name" v={clinic.name} />
            <Row k="City" v={clinic.city} />
            <Row k="Address" v={clinic.address ?? "-"} />
            <Row k="Phone" v={clinic.phone ?? "-"} />
            <Row k="Timezone" v={clinic.timezone} />
            <Row k="Languages" v={langs} />
            <Row k="Plan" v={clinic.plan === "pilot" ? "Pilot" : "Standard"} />
          </dl>
        </Section>

        <Section title="Doctors">
          {doctors.doctors.length === 0 ? (
            <p className="text-muted">No doctors added yet.</p>
          ) : (
            <ul className="divide-line divide-y">
              {doctors.doctors.map((d) => (
                <li key={d.id} className="py-2 text-[15px]">
                  <span className="font-medium">{d.name}</span>
                  {d.title ? <span className="text-muted"> · {d.title}</span> : null}
                  {!d.active ? <span className="text-muted"> (inactive)</span> : null}
                  <span className="text-muted block text-sm">
                    {d.specialties.join(", ") || "General dentistry"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Services">
          {services.services.length === 0 ? (
            <p className="text-muted">No services added yet.</p>
          ) : (
            <table className="w-full text-left text-[15px]">
              <thead className="text-muted text-sm">
                <tr>
                  <th className="py-1 font-normal">Service</th>
                  <th className="py-1 font-normal">Duration</th>
                  <th className="py-1 font-normal">Price</th>
                </tr>
              </thead>
              <tbody>
                {services.services.map((s) => (
                  <tr key={s.id} className="border-line border-t">
                    <td className="py-2">{s.name}</td>
                    <td className="py-2">{s.durationMin} min</td>
                    <td className="py-2">{s.priceInr != null ? `₹${s.priceInr}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Booking rules">
          <dl>
            <Row k="Slot grain" v={`${rules.slotRules.slotGrainMin} min`} />
            <Row k="Lead time" v={`${rules.slotRules.leadTimeMin} min`} />
            <Row k="Book up to" v={`${rules.slotRules.maxDaysAhead} days ahead`} />
            <Row
              k="Same-day booking"
              v={rules.slotRules.allowSameDay ? "Allowed" : "Not allowed"}
            />
            <Row k="Max per slot" v={rules.slotRules.maxPerSlot} />
          </dl>
        </Section>

        <Section title="Assistant">
          {assistant ? (
            <dl>
              <Row k="Name" v={assistant.assistant.name} />
              <Row k="Tone" v={assistant.assistant.tone} />
              <Row k="Hand-off number" v={assistant.assistant.handoffNumber ?? "-"} />
              <Row k="FAQ entries" v={assistant.assistant.faq.length} />
            </dl>
          ) : (
            <p className="text-muted">Assistant not set up yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
