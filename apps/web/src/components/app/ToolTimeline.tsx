export interface ToolEntry {
  name: string;
  status: "started" | "done" | "failed";
  summary: string;
}

const MARK: Record<ToolEntry["status"], { glyph: string; cls: string; label: string }> = {
  started: { glyph: "…", cls: "text-[#8a4b04]", label: "Working" },
  done: { glyph: "✓", cls: "text-accent-deep", label: "Done" },
  failed: { glyph: "!", cls: "text-danger", label: "Failed" },
};

export function ToolTimeline({ tools }: { tools: ToolEntry[] }) {
  if (tools.length === 0) return null;
  return (
    <section aria-label="Assistant actions">
      <h2 className="font-display mb-2 text-lg">What the assistant is doing</h2>
      <ol className="border-line bg-surface divide-line divide-y rounded-2xl border">
        {tools.map((t, i) => {
          const m = MARK[t.status];
          return (
            <li
              key={i}
              data-status={t.status}
              className="flex items-center gap-3 px-4 py-2.5 text-[15px]"
            >
              <span aria-label={m.label} className={`w-4 text-center font-semibold ${m.cls}`}>
                {m.glyph}
              </span>
              <span className={t.status === "started" ? "text-muted" : ""}>{t.summary}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
