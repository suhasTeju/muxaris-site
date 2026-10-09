import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, MonoLabel } from "@/components/ui";

const SECTIONS: Array<{ title: string; links: Array<[label: string, href: string]> }> = [
  {
    title: "Overview",
    links: [
      ["Owner, standard plan", "/dev/core/overview"],
      ["Front desk", "/dev/core/overview?role=front_desk"],
      ["Pilot plan", "/dev/core/overview?plan=pilot"],
      ["Quiet day", "/dev/core/overview?state=empty"],
      ["Sections failed to load", "/dev/core/overview?state=error"],
    ],
  },
  {
    title: "Appointments",
    links: [
      ["Today by doctor", "/dev/core/appointments"],
      ["Week", "/dev/core/appointments?view=week"],
      ["Nothing booked", "/dev/core/appointments?state=empty"],
      ["Upcoming appointment", "/dev/core/appointments?id=a7"],
      ["Ended appointment", "/dev/core/appointments?id=a3"],
      ["Completed appointment", "/dev/core/appointments?id=a1"],
      ["New appointment", "/dev/core/appointments?dialog=new"],
      ["Reschedule", "/dev/core/appointments?id=a7&dialog=reschedule"],
      ["Cancel", "/dev/core/appointments?id=a7&dialog=cancel"],
    ],
  },
  {
    title: "Patients",
    links: [
      ["List", "/dev/core/patients"],
      ["No patients yet", "/dev/core/patients?state=empty"],
      ["Add patient", "/dev/core/patients?add=1"],
      ["Patient", "/dev/core/patients/p1"],
      ["Patient, editing", "/dev/core/patients/p1?edit=1"],
      ["Unnamed patient", "/dev/core/patients/p10"],
      ["Patient without calls", "/dev/core/patients/p3"],
      ["Failed message with Retry", "/dev/core/patients/p2"],
    ],
  },
  {
    title: "Calls",
    links: [
      ["All calls", "/dev/core/calls"],
      ["Filtered", "/dev/core/calls?outcome=booked&status=completed"],
      ["No matches", "/dev/core/calls?outcome=handoff&from=2026-10-01&to=2026-10-02"],
      ["No calls yet", "/dev/core/calls?state=empty"],
      ["Booked call (c1)", "/dev/core/calls/c1"],
      ["Handoff with callback (c5)", "/dev/core/calls/c5"],
      ["Edited by staff (c7)", "/dev/core/calls/c7"],
      ["Abandoned (c4)", "/dev/core/calls/c4"],
      ["Browser test call (c8)", "/dev/core/calls/c8"],
      ["Failed call (c12)", "/dev/core/calls/c12"],
      ["Purged after 90 days (c14)", "/dev/core/calls/c14"],
      ["Recording being saved", "/dev/core/calls/c9?rec=pending"],
      ["Recording gone", "/dev/core/calls/c9?rec=missing"],
      ["Recording failed to load", "/dev/core/calls/c9?rec=error"],
    ],
  },
];

/** Index of the core-area previews. Development only. */
export default function CoreIndex() {
  return (
    <div className="min-h-screen px-[16px] py-[48px] sm:px-[32px]">
      <div className="mx-auto flex max-w-[960px] flex-col gap-[28px]">
        <header className="flex flex-col gap-[8px]">
          <Link href="/dev" className="text-ink-3 text-[13.5px] font-medium">
            Dev preview
          </Link>
          <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">
            Core screens
          </h1>
          <p className="text-muted m-0 max-w-[620px] text-[15px]">
            Overview, Appointments, Patients and Calls with the design&apos;s fixtures. Today is Fri
            9 Oct 2026, 2:10 pm. Appointment, patient and call actions run against an in-memory API
            that resets on reload.
          </p>
        </header>
        <div className="grid gap-[12px] md:grid-cols-2">
          {SECTIONS.map((s) => (
            <Card key={s.title} radius={18} className="flex flex-col gap-[10px] p-[20px]">
              <MonoLabel as="h2" className="m-0">
                {s.title}
              </MonoLabel>
              <ul className="m-0 flex list-none flex-col p-0">
                {s.links.map(([label, href]) => (
                  <li key={href} className="border-line-soft border-t first:border-t-0">
                    <Link
                      href={href}
                      className="text-ink-2 hover:text-teal-ink flex items-center justify-between gap-[12px] py-[9px] text-[14px]"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-2 truncate font-mono text-[11.5px]">
                          {href}
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
