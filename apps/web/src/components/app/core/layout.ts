/**
 * Responsive adaptations shared by the core pages. The design has no breakpoints, so every
 * rule here applies below 1024px only and leaves the desktop values literal.
 */

/** Page titles drop from 26px to 22px below 1024px (PageHeader takes no size prop yet). */
export const PAGE_TITLE_MOBILE = "max-lg:[&_h1]:text-[22px]";

/** Wide tables scroll inside their card below this width instead of squeezing columns. */
export const CALLS_TABLE_MIN_W = "min-w-[940px]";
