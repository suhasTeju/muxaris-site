import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, MonoLabel, Wordmark } from "@/components/ui";

const SECTIONS: Array<{
  title: string;
  links: Array<[label: string, href: string, note?: string]>;
}> = [
  {
    title: "Foundation",
    links: [
      ["App shell", "/dev/shell"],
      ["App shell, front desk on pilot", "/dev/shell?role=front_desk&plan=pilot"],
      ["App shell, two clinics", "/dev/shell?clinics=2"],
      ["UI kit", "/dev/ui"],
      ["UI kit, dialog open", "/dev/ui?m=dialog"],
      ["UI kit, drawer open", "/dev/ui?m=drawer"],
      ["UI kit, toasts", "/dev/ui?t=1"],
    ],
  },
  {
    title: "Page areas",
    links: [
      ["Public site", "/dev/site", "landing, pricing, FAQ, legal, 404"],
      ["Sign in", "/dev/auth", "sign in, sign up, verify, reset"],
      ["Onboarding", "/dev/onboarding", "five-step wizard"],
      ["Core", "/dev/core", "overview, appointments, patients, calls"],
      ["Operations", "/dev/ops", "callbacks, notifications, analytics, settings"],
      ["Assistant", "/dev/assistant", "configure, try your assistant"],
    ],
  },
];

/** Index of the development-only preview routes. */
export default function DevIndex() {
  return (
    <div className="min-h-screen px-[16px] py-[48px] sm:px-[32px]">
      <div className="mx-auto flex max-w-[960px] flex-col gap-[28px]">
        <header className="flex flex-col gap-[12px]">
          <Wordmark width={120} />
          <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">
            Dev preview
          </h1>
          <p className="text-muted m-0 max-w-[620px] text-[15px]">
            Screens rendered with the design&apos;s fixture data, without sign-in or API calls.
            Development only: every route here is a 404 in a production build. Area pages appear as
            each implementer adds them.
          </p>
        </header>
        <div className="grid gap-[12px] md:grid-cols-2">
          {SECTIONS.map((s) => (
            <Card key={s.title} radius={18} className="flex flex-col gap-[10px] p-[20px]">
              <MonoLabel as="h2" className="m-0">
                {s.title}
              </MonoLabel>
              <ul className="m-0 flex list-none flex-col p-0">
                {s.links.map(([label, href, note]) => (
                  <li key={href} className="border-line-soft border-t first:border-t-0">
                    <Link
                      href={href}
                      className="text-ink-2 hover:text-teal-ink flex items-center justify-between gap-[12px] py-[9px] text-[14px]"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-2 truncate font-mono text-[11.5px]">
                          {href}
                          {note ? ` · ${note}` : ""}
                        </span>
                      </span>
                      <ArrowUpRight size={13} className="text-muted-2 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
