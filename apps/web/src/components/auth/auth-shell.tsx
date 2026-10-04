import Image from "next/image";
import Link from "next/link";
import { authConfigured } from "@/lib/amplify";

export function AuthShell({
  title,
  aside,
  children,
  footer,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <Link
        href="/"
        aria-label="Muxaris home"
        className="focus-visible:ring-accent-soft mb-10 rounded outline-none focus-visible:ring-4"
      >
        <Image src="/brand/muxaris-wordmark.svg" alt="Muxaris" width={140} height={37} priority />
      </Link>
      <section className="border-line bg-surface shadow-card w-full max-w-md rounded-2xl border p-8 sm:p-10">
        <h1 className="font-display text-3xl leading-tight">{title}</h1>
        {aside ? <p className="font-display text-muted mt-2 italic">{aside}</p> : null}
        <div className="mt-8">
          {authConfigured ? (
            children
          ) : (
            <p
              role="alert"
              className="border-line bg-paper text-muted rounded-lg border p-4 text-sm"
            >
              Auth not configured. Set <code>NEXT_PUBLIC_COGNITO_USER_POOL_ID</code> and{" "}
              <code>NEXT_PUBLIC_COGNITO_CLIENT_ID</code>, then restart the dev server.
            </p>
          )}
        </div>
      </section>
      {footer ? <div className="text-muted mt-6 text-sm">{footer}</div> : null}
    </main>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-ink text-sm font-medium">{label}</span>
      <input
        {...props}
        className="border-line bg-paper text-ink placeholder:text-muted focus:border-accent focus:ring-accent-soft mt-1.5 w-full rounded-lg border px-3.5 py-2.5 text-base outline-none focus:ring-4"
      />
    </label>
  );
}

export function PrimaryButton({
  busy,
  children,
  ...props
}: { busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className="bg-accent hover:bg-accent-deep focus-visible:ring-accent-soft w-full rounded-lg px-4 py-3 font-medium text-on-accent transition-colors outline-none focus-visible:ring-4 disabled:opacity-60"
    >
      {busy ? "One moment…" : children}
    </button>
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="border-line text-ink hover:bg-paper bg-surface focus-visible:ring-accent-soft w-full rounded-lg border px-4 py-3 font-medium transition-colors outline-none focus-visible:ring-4 disabled:opacity-60"
    />
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3.5 py-2.5 text-sm">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="bg-accent-soft text-ink rounded-lg px-3.5 py-2.5 text-sm">
      {message}
    </p>
  );
}
