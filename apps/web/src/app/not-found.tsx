import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="bg-paper fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-[32px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(40% 50% at 50% 30%,rgba(14,154,150,0.14),transparent 70%)",
        }}
      />
      <div className="relative flex max-w-[460px] animate-[mxIn8_.3s_ease_both] flex-col items-center gap-[18px] text-center motion-reduce:animate-none">
        <span className="text-teal-ink font-mono text-[13px] tracking-[0.12em]">404 · Muxaris</span>
        <h1 className="m-0 text-[40px] leading-[1.05] font-semibold tracking-[-0.04em] sm:text-[48px]">
          We couldn’t find that page
        </h1>
        <p className="text-muted m-0 text-[17px] leading-[1.6]">
          The link may be out of date, or the page may have moved.
        </p>
        <ButtonLink href="/" size={52} className="mt-[8px] shadow-none">
          Go to the home page
        </ButtonLink>
      </div>
    </main>
  );
}
