import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class joiner for the primitives. Later classes win over earlier ones, including the design
 * token scales below, so `className` passed to a primitive reliably overrides its defaults.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: [
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "14",
        "16",
        "18",
        "20",
        "pill",
        "card",
        "inner",
      ],
      shadow: [
        "rest",
        "nav",
        "seg",
        "hover",
        "drawer",
        "dialog",
        "toast",
        "knob",
        "highlight",
        "cta",
        "focus",
        "lift",
        "card",
      ],
      animate: ["mx-in", "mx-toast", "mx-sheet", "mx-fade", "mx-spin", "mx-pulse", "mx-caret"],
    },
  },
});

/** Falsy values (from `cond && "class"`) are dropped. */
export type ClassValue = string | number | bigint | boolean | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter((c): c is string => typeof c === "string" && c !== "").join(" "));
}
