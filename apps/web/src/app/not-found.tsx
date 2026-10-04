import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-start gap-4 px-6 py-24">
      <p className="font-display text-accent-deep text-lg italic">Muxaris</p>
      <h1 className="font-display text-3xl leading-tight">We couldn’t find that page</h1>
      <p className="text-muted">The link may be out of date, or the page may have moved.</p>
      <Link
        href="/"
        className="bg-accent hover:bg-accent-deep focus-visible:ring-accent-soft text-on-accent rounded-lg px-5 py-2.5 font-medium transition-colors outline-none focus-visible:ring-4"
      >
        Go to the home page
      </Link>
    </main>
  );
}
