import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PLANS, PRICING_NOTE } from "@/lib/content";
import { ANCHOR, SECTION_X, SectionHeader } from "./SectionHeader";
import { SiteLink } from "./SiteLink";

/**
 * The two plans. On the home page it carries its own heading; on /pricing it sits under the page
 * H1, so the plan names step up from h3 to h2.
 */
export function Pricing({ heading = true }: { heading?: boolean }) {
  const PlanTitle = heading ? "h3" : "h2";
  return (
    <section
      id="pricing"
      className={cn(
        SECTION_X,
        ANCHOR,
        heading
          ? "border-line border-t py-[80px] lg:py-[128px]"
          : "pt-[48px] pb-[96px] lg:pt-[56px] lg:pb-[120px]",
      )}
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-[40px] lg:gap-[56px]">
        {heading && (
          <SectionHeader
            eyebrow="Pricing"
            aside="Start free."
            asideTone="teal"
            className="items-center text-center"
          >
            One honest price.
          </SectionHeader>
        )}
        <div className="grid items-stretch gap-[20px] md:grid-cols-2">
          {PLANS.map((p) => {
            const hi = p.highlight;
            return (
              <article
                key={p.id}
                data-plan={p.id}
                className={cn(
                  "relative flex flex-col gap-[28px] rounded-[28px] p-[28px] sm:p-[34px]",
                  hi
                    ? "border-teal border-[1.5px] bg-[linear-gradient(180deg,#f0faf9_0%,#ffffff_46%)] shadow-[0_0_0_6px_rgba(14,154,150,0.08),0_40px_80px_-40px_rgba(14,154,150,0.45)]"
                    : "border-line bg-surface shadow-rest border",
                )}
              >
                <div className="flex flex-col gap-[16px]">
                  <PlanTitle
                    className={cn(
                      "m-0 font-mono text-[12px] leading-[1.5] font-normal tracking-[0.12em] uppercase",
                      hi ? "text-teal-ink" : "text-muted",
                    )}
                  >
                    {p.name}
                  </PlanTitle>
                  <p className="m-0 flex items-baseline gap-[10px]">
                    <span className="text-[60px] leading-none font-semibold tracking-[-0.045em]">
                      {p.price}
                    </span>
                    <span className="text-muted text-[16px]">{p.cadence}</span>
                  </p>
                  <p className="text-ink-3 m-0 text-[15.5px] leading-[1.55]">{p.blurb}</p>
                </div>
                <ul
                  className={cn(
                    "m-0 flex flex-1 list-none flex-col gap-[12px] border-t p-0 pt-[24px]",
                    hi ? "border-teal-line" : "border-line",
                  )}
                >
                  {p.features.map((f) => (
                    <li key={f} className="text-ink-2 flex items-center gap-[12px] text-[15px]">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "rounded-6 grid size-[20px] flex-none place-items-center",
                          hi ? "bg-teal text-white" : "bg-chip text-ink-2",
                        )}
                      >
                        <Check size={12} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <SiteLink
                  href="/#demo"
                  stay
                  className={
                    hi
                      ? buttonClass({ size: 52, block: true, className: "shadow-cta" })
                      : buttonClass({
                          variant: "secondary",
                          size: 52,
                          block: true,
                          className: "font-semibold",
                        })
                  }
                >
                  {p.cta}
                </SiteLink>
              </article>
            );
          })}
        </div>
        <p className="text-muted m-0 mx-auto max-w-[720px] text-center text-[14px] leading-[1.6] text-pretty">
          {PRICING_NOTE}
        </p>
      </div>
    </section>
  );
}
