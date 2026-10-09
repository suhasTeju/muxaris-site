import type { DemoFormState } from "./demo-request";
import { Faq } from "./Faq";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { LanguageMarquee } from "./LanguageMarquee";
import { Languages } from "./Languages";
import { LiveDemo } from "./LiveDemo";
import { Pricing } from "./Pricing";
import { ProblemStats } from "./ProblemStats";
import { Shell } from "./Shell";
import { WhatItHandles } from "./WhatItHandles";
import { WhoItsFor } from "./WhoItsFor";

/**
 * The home page, top to bottom. The props only matter to dev previews: they open the page in a
 * state a visitor reaches by interacting (signed in, a sent or failed demo request, mid-call).
 */
export function Landing({
  signedIn,
  demoState,
  demoTime,
  children,
}: {
  signedIn?: boolean;
  demoState?: DemoFormState;
  /** Freeze the sample call at this many seconds instead of replaying it. */
  demoTime?: number;
  children?: React.ReactNode;
}) {
  return (
    <Shell>
      {children}
      <Hero />
      <LanguageMarquee />
      <ProblemStats />
      <LiveDemo signedIn={signedIn} initialTime={demoTime ?? 0} loop={demoTime === undefined} />
      <HowItWorks />
      <Languages />
      <WhatItHandles />
      <WhoItsFor />
      <Pricing />
      <Faq />
      <FinalCta initialState={demoState} />
    </Shell>
  );
}
