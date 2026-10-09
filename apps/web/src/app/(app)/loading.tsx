export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-[22px]">
      <span className="sr-only">Loading…</span>
      <div className="bg-chip h-[30px] w-48 animate-pulse rounded-8 motion-reduce:animate-none" />
      <div className="grid gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-chip h-[124px] animate-pulse rounded-16 motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="bg-chip h-64 animate-pulse rounded-16 motion-reduce:animate-none" />
    </div>
  );
}
