/** Screen-reader copy of a chart's numbers: one row per category, one column per series. */
export function DataTable({
  title,
  categories,
  series,
}: {
  title: string;
  categories: string[];
  series: Array<{ name: string; values: Array<number | string> }>;
}) {
  return (
    <table className="sr-only" aria-label={title}>
      <thead>
        <tr>
          <th scope="col">Category</th>
          {series.map((s) => (
            <th key={s.name} scope="col">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((cat, i) => (
          <tr key={`${cat}-${i}`}>
            <th scope="row">{cat}</th>
            {series.map((s) => (
              <td key={s.name}>{s.values[i] ?? 0}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Bar size as a percentage of the largest value, one decimal, never dividing by zero. */
export function pct(value: number, max: number): string {
  return ((value / Math.max(max, 1)) * 100).toFixed(1);
}
