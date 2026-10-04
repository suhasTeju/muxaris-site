import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import { RETRY_SUFFIX, SYSTEM_PROMPT, buildUserMessage, type PromptTurn } from "./prompt.js";

export const analysisSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  outcome: z.enum([
    "booked",
    "rescheduled",
    "cancelled",
    "info",
    "callback",
    "handoff",
    "abandoned",
    "unknown",
  ]),
  needsCallback: z.boolean(),
  callbackReason: z.string().trim().max(200).nullable().optional(),
  entities: z
    .object({
      patientName: z.string().max(80).optional(),
      requestedService: z.string().max(80).optional(),
      requestedDate: z.string().max(40).optional(),
      language: z.string().max(10).optional(),
    })
    .default({}),
});
type RawAnalysis = z.infer<typeof analysisSchema>;
export type Analysis = Omit<RawAnalysis, "callbackReason"> & { callbackReason?: string };

export interface Analyser {
  analyse(input: {
    turns: PromptTurn[];
    language: string;
    gatewayOutcome: string | null;
  }): Promise<Analysis>;
}

export class AnalysisError extends Error {
  override readonly name = "AnalysisError";
  constructor(message: string) {
    super(message);
  }
}

const MAX_WORDS = 60;
const LOCKED_OUTCOMES = new Set(["booked", "rescheduled", "cancelled"]);

function truncateWords(s: string, max: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(" ") : words.slice(0, max).join(" ");
}

/** Replaces any run of 8+ digits (spaces/dashes allowed between digits) with "[number]". */
export function stripNumbers(s: string): string {
  return s.replace(/\d(?:[ -]?\d){7,}/g, "[number]");
}

function parseModelJson(raw: string): RawAnalysis {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  // Models sometimes emit a long summary; truncate before schema validation so it still parses.
  const obj: unknown = JSON.parse(body);
  if (
    obj &&
    typeof obj === "object" &&
    typeof (obj as { summary?: unknown }).summary === "string"
  ) {
    const o = obj as { summary: string };
    o.summary = truncateWords(o.summary, MAX_WORDS);
  }
  return analysisSchema.parse(obj);
}

export function createNovaAnalyser(opts: {
  modelId: string;
  region: string;
  client?: { send(cmd: unknown): Promise<unknown> };
}): Analyser {
  const client = opts.client ?? new BedrockRuntimeClient({ region: opts.region });

  async function ask(userText: string): Promise<string> {
    const res = (await client.send(
      new ConverseCommand({
        modelId: opts.modelId,
        system: [{ text: SYSTEM_PROMPT }],
        messages: [{ role: "user", content: [{ text: userText }] }],
        inferenceConfig: { maxTokens: 400, temperature: 0.2 },
      }),
    )) as { output?: { message?: { content?: Array<{ text?: string }> } } };
    return (res.output?.message?.content ?? []).map((c) => c.text ?? "").join("");
  }

  return {
    async analyse(input) {
      const userText = buildUserMessage(input);
      let parsed: RawAnalysis | null = null;
      for (const text of [userText, `${userText}\n\n${RETRY_SUFFIX}`]) {
        try {
          parsed = parseModelJson(await ask(text));
          break;
        } catch (e) {
          if (!(e instanceof SyntaxError || e instanceof z.ZodError)) throw e;
        }
      }
      if (!parsed) throw new AnalysisError("unparseable");
      const outcome =
        input.gatewayOutcome && LOCKED_OUTCOMES.has(input.gatewayOutcome)
          ? (input.gatewayOutcome as Analysis["outcome"])
          : parsed.outcome;
      const { callbackReason, ...rest } = parsed;
      return {
        ...rest,
        summary: stripNumbers(parsed.summary),
        ...(callbackReason ? { callbackReason: stripNumbers(callbackReason) } : {}),
        outcome,
      };
    },
  };
}
