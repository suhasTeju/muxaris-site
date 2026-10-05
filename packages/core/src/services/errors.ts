export type CoreErrorCode =
  | "not_found"
  | "conflict"
  | "forbidden"
  | "validation"
  | "slot_unavailable"
  | "clinic_limit"
  | "provider";

/** Why a requested start time is not bookable (CoreError code `slot_unavailable`). */
export type SlotUnavailableReason =
  | "outside_hours"
  | "holiday"
  | "time_off"
  | "lead_time"
  | "too_far_ahead"
  | "past"
  | "not_on_grain"
  | "full"
  | "conflict";

export class CoreError extends Error {
  constructor(
    public code: CoreErrorCode,
    message: string,
    public reason?: SlotUnavailableReason,
  ) {
    super(message);
    this.name = "CoreError";
  }
}

export const slotUnavailable = (reason: SlotUnavailableReason, message: string) =>
  new CoreError("slot_unavailable", message, reason);
