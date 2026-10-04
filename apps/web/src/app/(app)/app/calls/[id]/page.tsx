import Link from "next/link";
import { notFound } from "next/navigation";
import type { Call, CallTurn, Clinic } from "@muxaris/shared";
import { ApiError } from "@/lib/api";
import { requireActiveClinic, serverApi } from "@/lib/api-server";
import { formatDateTime, formatDuration } from "@/lib/dashboard";
import { CallStatusBadge, OutcomeBadge } from "@/components/app/Badge";
import { languageLabel } from "@/components/app/CallList";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await requireActiveClinic();
  let data: { call: Call; turns: CallTurn[] };
  try {
    data = await serverApi<{ call: Call; turns: CallTurn[] }>(
      `/v1/calls/${encodeURIComponent(id)}`,
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const { clinic } = await serverApi<{ clinic: Clinic }>(`/v1/clinics/${active.clinicId}`);
  const { call, turns } = data;
  return (
    <div className="max-w-3xl px-4 py-8 sm:px-8">
      <Link href="/app/calls" className="text-muted text-sm underline-offset-4 hover:underline">
        ← All calls
      </Link>
      <h1 className="font-display mt-2 text-3xl">
        {formatDateTime(call.startedAt, clinic.timezone)}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <OutcomeBadge outcome={call.outcome} />
        <CallStatusBadge status={call.status} />
        <span className="text-muted">{formatDuration(call.durationS)}</span>
        <span className="text-muted">{languageLabel(call.languageDetected)}</span>
        <span className="text-muted">
          {call.channel === "browser" ? "Test call" : "Phone call"}
        </span>
      </div>
      {call.summary && <p className="mt-4 text-[15px]">{call.summary}</p>}
      <h2 className="font-display mt-8 mb-3 text-xl">Transcript</h2>
      {turns.length === 0 ? (
        <p className="text-muted font-display italic">No transcript was recorded for this call.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {turns.map((t) =>
            t.role === "tool" ? (
              <li key={t.id} className="text-muted text-xs">
                Assistant used <code>{t.toolName}</code>
              </li>
            ) : (
              <li
                key={t.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] ${
                  t.role === "assistant"
                    ? "bg-accent-soft self-start"
                    : "border-line bg-surface self-end border"
                }`}
              >
                <span className="text-muted block text-xs">
                  {t.role === "assistant" ? "Assistant" : "Caller"}
                </span>
                {t.text}
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  );
}
