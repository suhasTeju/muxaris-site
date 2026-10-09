import { cn } from "./cn";

/** Loading ring: 2px #c6e8e5 track, teal head, mxSpin 0.8s. 14px inline, 16px in panels. */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "border-teal-line border-t-teal animate-mx-spin inline-block shrink-0 rounded-full border-2",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
