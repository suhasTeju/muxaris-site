import { z } from "zod";

export const postCallMessageSchema = z.object({
  type: z.literal("call.completed"),
  clinicId: z.string(),
  callId: z.string(),
  endedAt: z.string(),
  attempt: z.number().int().min(1).default(1),
});
export type PostCallMessage = z.infer<typeof postCallMessageSchema>;
