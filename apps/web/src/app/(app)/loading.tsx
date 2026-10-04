export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="max-w-5xl px-4 py-8 sm:px-8">
      <span className="sr-only">Loading…</span>
      <div className="bg-line h-9 w-48 animate-pulse rounded-lg motion-reduce:animate-none" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-line h-24 animate-pulse rounded-2xl motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="bg-line mt-6 h-64 animate-pulse rounded-2xl motion-reduce:animate-none" />
    </div>
  );
}
