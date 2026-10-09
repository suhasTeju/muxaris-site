/**
 * The Muxaris wordmark, exactly as the design draws it: "muxarıs" (dotless ı) in Fraunces 600 with
 * the signal-green dot standing in for the i's tittle. Fraunces comes from next/font via
 * --font-wordmark (a presentation attribute could not resolve the hashed family name).
 */
export function Wordmark({
  width = 108,
  light = false,
  className,
  title = "Muxaris",
}: {
  /** Rendered width in px; height follows the 180×48 viewBox (108 → 29, 120 → 32, 150 → 40). */
  width?: number;
  /** Off-white letters (#fafaf7) for dark backgrounds. */
  light?: boolean;
  className?: string;
  title?: string;
}) {
  const height = Math.round((width * 48) / 180);
  return (
    <svg
      viewBox="0 0 180 48"
      width={width}
      height={height}
      role="img"
      aria-label={title}
      className={className}
    >
      <text
        x="0"
        y="36"
        fontSize="40"
        fontWeight="600"
        fill={light ? "#fafaf7" : "#0c1220"}
        letterSpacing="-1"
        style={{ fontFamily: "var(--font-wordmark), Fraunces, Georgia, serif" }}
      >
        muxarıs
      </text>
      <circle cx="160.5" cy="12.5" r="4" fill="#16a34a" />
    </svg>
  );
}
