import { cn } from "./cn";

export interface EmptyStateProps {
  children: React.ReactNode;
  /** Optional call to action under the text (e.g. a primary ButtonLink). */
  action?: React.ReactNode;
  /** md: 48px top/bottom padding (Appointments, Calls). sm: 44px (Patients, Callbacks, Notifications). */
  size?: "md" | "sm";
  className?: string;
}

/** Dashed empty panel: 1.5px dashed #d3dae3, radius 16, translucent white, italic 15px #5f6b7c. */
export function EmptyState({ children, action, size = "md", className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-field rounded-16 border-[1.5px] border-dashed bg-white/60 px-[24px] text-center text-[15px] text-muted italic",
        size === "md" ? "py-[48px]" : "py-[44px]",
        action && "flex flex-col items-center gap-[14px]",
        className,
      )}
    >
      {action ? <span>{children}</span> : children}
      {action ? <div className="not-italic">{action}</div> : null}
    </div>
  );
}
