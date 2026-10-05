export interface BarSeries {
  name: string;
  values: number[];
  className?: string;
}

const W = 640;
const H = 220;
const PAD_L = 36;
const PAD_B = 28;
const PAD_T = 8;
const GAP = 0.2;

export function BarChart({
  title,
  categories,
  series,
  valueLabel = (v) => String(v),
}: {
  title: string;
  categories: string[];
  series: BarSeries[];
  valueLabel?: (v: number) => string;
}) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const groupW = (W - PAD_L) / Math.max(1, categories.length);
  const barW = (groupW * (1 - GAP)) / Math.max(1, series.length);
  const plotH = H - PAD_B - PAD_T;
  const y = (v: number) => (max === 0 ? 0 : (v / max) * plotH);
  const tickEvery = categories.length > 14 ? Math.ceil(categories.length / 7) : 1;
  const fillOf = (s: BarSeries, j: number) =>
    s.className ?? (j === 0 ? "fill-[var(--color-accent)]" : "fill-[var(--color-ink)]/40");
  return (
    <figure className="border-line bg-surface rounded-card border p-4">
      <figcaption className="text-muted text-sm">{title}</figcaption>
      <svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        <line x1={PAD_L} x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--color-line)" />
        <text x={0} y={PAD_T + 10} fontSize="11" fill="var(--color-muted)">
          {valueLabel(max)}
        </text>
        {categories.map((cat, i) => (
          <g key={cat + i} transform={`translate(${PAD_L + i * groupW + (groupW * GAP) / 2},0)`}>
            {series.map((s, j) => {
              const v = s.values[i] ?? 0;
              const h = y(v);
              return (
                <rect
                  key={s.name}
                  data-bar
                  x={j * barW}
                  y={H - PAD_B - h}
                  width={Math.max(1, barW - 1)}
                  height={h}
                  className={fillOf(s, j)}
                >
                  <title>{`${cat} · ${s.name}: ${valueLabel(v)}`}</title>
                </rect>
              );
            })}
            {i % tickEvery === 0 && (
              <text
                x={(groupW * (1 - GAP)) / 2}
                y={H - 8}
                fontSize="11"
                textAnchor="middle"
                fill="var(--color-muted)"
              >
                {cat}
              </text>
            )}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <ul className="text-muted mt-1 flex gap-4 text-xs" aria-hidden="true">
          {series.map((s, j) => (
            <li key={s.name}>
              <span
                className={`mr-1 inline-block h-2 w-2 ${j === 0 ? "bg-[var(--color-accent)]" : "bg-[var(--color-ink)]/40"}`}
              />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <table className="sr-only" aria-label={title}>
        <thead>
          <tr>
            <th>Category</th>
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat, i) => (
            <tr key={cat + i}>
              <th scope="row">{cat}</th>
              {series.map((s) => (
                <td key={s.name}>{valueLabel(s.values[i] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
