export default function OnboardingLoading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="bg-line h-8 w-40 animate-pulse rounded-lg motion-reduce:animate-none" />
      <div className="bg-line mt-6 h-72 animate-pulse rounded-2xl motion-reduce:animate-none" />
    </div>
  );
}
