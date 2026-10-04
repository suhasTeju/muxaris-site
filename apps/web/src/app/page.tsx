import Image from "next/image";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <Image src="/brand/muxaris-wordmark.svg" alt="Muxaris" width={180} height={48} priority />
      <h1 className="font-display text-5xl">Your front desk misses calls. Muxaris doesn’t.</h1>
      <p className="text-muted text-lg">
        An AI voice receptionist for Indian dental clinics. It answers every call, books the
        appointment and confirms it to the patient.
      </p>
      <p className="text-accent-deep text-sm font-medium tracking-wide uppercase">Coming soon</p>
    </main>
  );
}
