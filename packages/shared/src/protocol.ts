import { z } from "zod";
import { LANGUAGE_CODES, type LanguageCode } from "./languages.js";
import { toolInputSchemas, type ToolName } from "./tools.js";

// Voice gateway wire protocol. JSON text frames; audio is binary
// (client to server PCM16 16 kHz, server to client PCM16 24 kHz).
// The auth token travels in the first text frame, never in the URL (ALB access logs).

export type ClientEvent =
  | { type: "start"; token: string; clinicId: string; language?: LanguageCode }
  | { type: "end" }
  | { type: "ping" };

export type GatewayEvent =
  | {
      type: "ready";
      callId: string;
      assistantName: string;
      greeting: string;
      language: LanguageCode;
    }
  | { type: "state"; state: "listening" | "thinking" | "speaking" }
  | { type: "transcript"; role: "user" | "assistant"; text: string; language?: string; final: true }
  | { type: "tool"; name: ToolName; status: "started" | "done" | "failed"; summary: string }
  | {
      type: "booking";
      appointmentId: string;
      doctorName: string;
      serviceName: string;
      startsAt: string;
    }
  | { type: "flush_playback" }
  | { type: "usage"; secondsUsed: number; secondsRemaining: number }
  | {
      type: "ended";
      reason: "caller" | "assistant" | "timeout" | "cap" | "error";
      outcome?: string;
    }
  | {
      type: "error";
      code:
        | "auth_failed"
        | "forbidden"
        | "busy"
        | "quota"
        | "provider"
        | "internal"
        | "not_implemented";
      message: string;
    };

export const GATEWAY_ERROR_CODES = [
  "auth_failed",
  "forbidden",
  "busy",
  "quota",
  "provider",
  "internal",
  "not_implemented",
] as const;
export const ENDED_REASONS = ["caller", "assistant", "timeout", "cap", "error"] as const;

const languageCode = z.enum(LANGUAGE_CODES);
const toolName = z.enum(Object.keys(toolInputSchemas) as [ToolName, ...ToolName[]]);

export const clientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    token: z.string().min(1),
    clinicId: z.string().min(1),
    language: languageCode.optional(),
  }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("ping") }),
]);

export const gatewayEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    callId: z.string(),
    assistantName: z.string(),
    greeting: z.string(),
    language: languageCode,
  }),
  z.object({
    type: z.literal("state"),
    state: z.enum(["listening", "thinking", "speaking"]),
  }),
  z.object({
    type: z.literal("transcript"),
    role: z.enum(["user", "assistant"]),
    text: z.string(),
    language: z.string().optional(),
    final: z.literal(true),
  }),
  z.object({
    type: z.literal("tool"),
    name: toolName,
    status: z.enum(["started", "done", "failed"]),
    summary: z.string(),
  }),
  z.object({
    type: z.literal("booking"),
    appointmentId: z.string(),
    doctorName: z.string(),
    serviceName: z.string(),
    startsAt: z.iso.datetime({ offset: true }),
  }),
  z.object({ type: z.literal("flush_playback") }),
  z.object({
    type: z.literal("usage"),
    secondsUsed: z.number().int().nonnegative(),
    secondsRemaining: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("ended"),
    reason: z.enum(ENDED_REASONS),
    outcome: z.string().optional(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.enum(GATEWAY_ERROR_CODES),
    message: z.string(),
  }),
]);
