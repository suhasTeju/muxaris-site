import { PROBLEM } from "@/lib/content";
import { CONTAINER, SECTION_X, SectionHeader } from "./SectionHeader";

export function ProblemStats() {
  return (
    <section className={`pt-[80px] pb-[80px] lg:pt-[128px] lg:pb-[120px] ${SECTION_X}`}>
      <div className={`${CONTAINER} flex flex-col gap-[40px] lg:gap-[56px]`}>
        <div className="grid items-end gap-[48px] lg:grid-cols-2">
          <SectionHeader eyebrow="The problem" aside={PROBLEM.aside}>
            {PROBLEM.title}
          </SectionHeader>
        </div>
        <ol className="m-0 grid list-none gap-[16px] p-0 md:grid-cols-3">
          {PROBLEM.moments.map((m, i) => (
            <li
              key={m.when}
              className="border-line bg-surface shadow-rest flex flex-col justify-between gap-[32px] rounded-[24px] border p-[28px] md:min-h-[220px] md:gap-[56px] lg:min-h-[260px]"
            >
              <span className="text-teal-ink font-mono text-[13px]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-[10px]">
                <h3 className="m-0 text-[22px] leading-[1.5] font-semibold tracking-[-0.02em]">
                  {m.when}
                </h3>
                <p className="text-muted m-0 text-[16px] leading-[1.6]">{m.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
