/** The Muxaris app mark (ink tile, three green voice bars), drawn as the design does. */
export function Mark({ size, className }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={className}>
      <rect width="48" height="48" rx="11" fill="#0c1220" />
      <rect x="14" y="19" width="5" height="10" rx="2.5" fill="#16a34a" />
      <rect x="21.5" y="15" width="5" height="18" rx="2.5" fill="#16a34a" />
      <rect x="29" y="18" width="5" height="12" rx="2.5" fill="#16a34a" />
    </svg>
  );
}
