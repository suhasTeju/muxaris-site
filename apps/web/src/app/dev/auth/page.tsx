import Link from "next/link";
import { Card, MonoLabel, Wordmark } from "@/components/ui";

const LINKS: Array<[label: string, href: string]> = [
  ["Sign in", "/dev/auth/sign-in"],
  ["Sign in, no Google", "/dev/auth/sign-in?google=0"],
  ["Sign in, wrong password", "/dev/auth/sign-in?state=error"],
  ["Sign in, submitting", "/dev/auth/sign-in?state=busy"],
  ["Sign in, session expired", "/dev/auth/sign-in?reason=session"],
  ["Sign in, email confirmed", "/dev/auth/sign-in?verified=1"],
  ["Sign in, password updated", "/dev/auth/sign-in?reset=1"],
  ["Sign in, Cognito not configured", "/dev/auth/sign-in?state=unconfigured"],
  ["Sign up", "/dev/auth/sign-up"],
  ["Sign up, weak password", "/dev/auth/sign-up?state=error"],
  ["Verify", "/dev/auth/verify"],
  ["Verify, wrong code", "/dev/auth/verify?state=error"],
  ["Verify, new code sent", "/dev/auth/verify?state=resent"],
  ["Reset password", "/dev/auth/forgot-password"],
  ["Reset password, code step", "/dev/auth/forgot-password?state=code"],
  ["Reset password, too many attempts", "/dev/auth/forgot-password?state=error"],
  ["Google callback, signing in", "/dev/auth/callback"],
  ["Google callback, failed", "/dev/auth/callback?error=access_denied"],
];

/** Index of the auth previews. */
export default function AuthPreviews() {
  return (
    <div className="min-h-screen px-[16px] py-[48px] sm:px-[32px]">
      <div className="mx-auto flex max-w-[720px] flex-col gap-[24px]">
        <Wordmark width={120} />
        <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">
          Auth previews
        </h1>
        <Card radius={18} className="p-[20px]">
          <MonoLabel as="h2" className="m-0">
            Muxaris Auth.dc.html
          </MonoLabel>
          <ul className="m-0 mt-[10px] flex list-none flex-col p-0">
            {LINKS.map(([label, href]) => (
              <li key={href} className="border-line-soft border-t first:border-t-0">
                <Link href={href} className="text-ink-2 flex flex-col py-[9px] text-[14px]">
                  <span className="font-medium">{label}</span>
                  <span className="text-muted-2 font-mono text-[11.5px]">{href}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
