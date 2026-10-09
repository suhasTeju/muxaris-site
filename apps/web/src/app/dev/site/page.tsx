import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, MonoLabel, Wordmark } from "@/components/ui";

const LINKS: Array<[label: string, href: string, note: string]> = [
  ["Landing", "/dev/site/landing", "sample call frozen at 0:19, as the reference render"],
  ["Landing, signed in", "/dev/site/landing?state=signedin", "“Try it live” beside Book a demo"],
  ["Landing, demo form error", "/dev/site/landing?state=demo-error#demo", "server error"],
  ["Landing, demo form invalid", "/dev/site/landing?state=demo-invalid#demo", "client-side checks"],
  ["Landing, demo form sent", "/dev/site/landing?state=demo-success#demo", "success"],
  ["Landing, live replay", "/dev/site/landing?t=live", "the silent loop, as visitors see it"],
  ["Pricing", "/dev/site/pricing", "same as /pricing"],
  ["FAQ", "/dev/site/faq", "same as /faq"],
  ["Privacy", "/dev/site/privacy", "same as /privacy"],
  ["Terms", "/dev/site/terms", "same as /terms"],
  ["404", "/dev/site/404", "the not-found page"],
  ["Error", "/dev/site/error", "public error boundary"],
  ["Error, inside the app", "/dev/site/error?signOut=1", "with Sign out"],
];

/** Index of the public-site previews. The live pages (/, /pricing, …) need no sign-in either. */
export default function SitePreviews() {
  return (
    <div className="min-h-screen px-[16px] py-[48px] sm:px-[32px]">
      <div className="mx-auto flex max-w-[720px] flex-col gap-[24px]">
        <Wordmark width={120} />
        <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">
          Public site previews
        </h1>
        <Card radius={18} className="flex flex-col gap-[10px] p-[20px]">
          <MonoLabel as="h2" className="m-0">
            Screens and states
          </MonoLabel>
          <ul className="m-0 flex list-none flex-col p-0">
            {LINKS.map(([label, href, note]) => (
              <li key={href} className="border-line-soft border-t first:border-t-0">
                <Link
                  href={href}
                  className="text-ink-2 hover:text-teal-ink flex items-center justify-between gap-[12px] py-[9px] text-[14px]"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-2 truncate font-mono text-[11.5px]">
                      {href} · {note}
                    </span>
                  </span>
                  <ArrowUpRight size={13} className="text-muted-2 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
