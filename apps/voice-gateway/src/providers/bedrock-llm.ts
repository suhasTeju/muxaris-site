import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ConverseStreamCommandInput,
  type ConverseStreamOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type { ASSISTANT_TOOLS, ToolName } from "@muxaris/shared";
import type { LlmDelta, LlmProvider, ToolDefinition } from "./types.js";

/** Maps shared `ASSISTANT_TOOLS` to Bedrock Converse tool specs. */
export function toBedrockTools(tools: typeof ASSISTANT_TOOLS): ToolDefinition[] {
  return tools.map((t) => ({
    toolSpec: {
      name: t.name,
      description: t.description,
      inputSchema: { json: t.inputSchema as never },
    },
  }));
}

const OPEN_TAG = "<thinking>";
const CLOSE_TAG = "</thinking>";

/** Longest suffix of `s` that is a proper prefix of `tag`. */
function partialSuffix(s: string, tag: string): number {
  const max = Math.min(s.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (tag.startsWith(s.slice(s.length - n))) return n;
  }
  return 0;
}

/**
 * Streaming `<thinking>...</thinking>` stripper. Text outside tags is emitted as it arrives;
 * only a possible partial `<thinking>` prefix is held back, and nothing inside an unclosed tag
 * is ever emitted.
 */
export class ThinkingStripper {
  private buf = "";
  private inThink = false;
  private skipWs = false;

  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    for (;;) {
      if (this.inThink) {
        const i = this.buf.indexOf(CLOSE_TAG);
        if (i >= 0) {
          this.buf = this.buf.slice(i + CLOSE_TAG.length);
          this.inThink = false;
          this.skipWs = true;
          continue;
        }
        this.buf = this.buf.slice(this.buf.length - partialSuffix(this.buf, CLOSE_TAG));
        return out;
      }
      if (this.skipWs) {
        this.buf = this.buf.replace(/^\s+/, "");
        if (this.buf.length === 0) return out;
        this.skipWs = false;
      }
      const i = this.buf.indexOf(OPEN_TAG);
      if (i >= 0) {
        out += this.buf.slice(0, i);
        this.buf = this.buf.slice(i + OPEN_TAG.length);
        this.inThink = true;
        continue;
      }
      const hold = partialSuffix(this.buf, OPEN_TAG);
      out += this.buf.slice(0, this.buf.length - hold);
      this.buf = this.buf.slice(this.buf.length - hold);
      return out;
    }
  }

  /** End of a text block: release held-back text unless inside an unclosed tag. */
  flush(): string {
    const rest = this.inThink ? "" : this.buf;
    this.buf = "";
    this.inThink = false;
    this.skipWs = false;
    return rest;
  }
}

type SendFn = (
  cmd: ConverseStreamCommand,
  opts?: { abortSignal?: AbortSignal },
) => Promise<{ stream?: AsyncIterable<ConverseStreamOutput> }>;

export interface BedrockLlmOptions {
  modelId: string;
  region: string;
  /** Test seam: anything with a Bedrock-compatible `send`. */
  client?: { send: SendFn };
}

export class BedrockLlm implements LlmProvider {
  private readonly modelId: string;
  private readonly client: { send: SendFn };

  constructor(opts: BedrockLlmOptions) {
    this.modelId = opts.modelId;
    this.client =
      opts.client ??
      (new BedrockRuntimeClient({ region: opts.region }) as unknown as { send: SendFn });
  }

  async *stream(req: Parameters<LlmProvider["stream"]>[0]): AsyncGenerator<LlmDelta> {
    if (req.signal.aborted) return;
    const abort = new AbortController();
    const onAbort = (): void => abort.abort();
    req.signal.addEventListener("abort", onAbort, { once: true });

    const input: ConverseStreamCommandInput = {
      modelId: this.modelId,
      system: [{ text: req.system }],
      messages: req.messages,
      inferenceConfig: { maxTokens: 400, temperature: 0.3 },
    };
    if (req.tools.length > 0) input.toolConfig = { tools: req.tools };

    const tools = new Map<number, { id: string; name: string; json: string }>();
    const stripper = new ThinkingStripper();
    let stopReason = "end_turn";
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    let doneYielded = false;

    try {
      const res = await this.client.send(new ConverseStreamCommand(input), {
        abortSignal: abort.signal,
      });
      if (!res.stream) throw new Error("Bedrock returned no stream");
      for await (const ev of res.stream) {
        if (req.signal.aborted) return;
        if (ev.contentBlockStart?.start?.toolUse) {
          const tu = ev.contentBlockStart.start.toolUse;
          tools.set(ev.contentBlockStart.contentBlockIndex ?? 0, {
            id: tu.toolUseId ?? "",
            name: tu.name ?? "",
            json: "",
          });
        } else if (ev.contentBlockDelta) {
          const idx = ev.contentBlockDelta.contentBlockIndex ?? 0;
          const delta = ev.contentBlockDelta.delta;
          if (delta?.toolUse) {
            const t = tools.get(idx);
            if (t) t.json += delta.toolUse.input ?? "";
          } else if (delta?.text) {
            const text = stripper.push(delta.text);
            if (text) yield { type: "text", text };
          }
        } else if (ev.contentBlockStop) {
          const idx = ev.contentBlockStop.contentBlockIndex ?? 0;
          const t = tools.get(idx);
          if (t) {
            tools.delete(idx);
            let parsed: unknown = {};
            if (t.json.trim().length > 0) {
              try {
                parsed = JSON.parse(t.json);
              } catch {
                console.warn(`Bedrock tool input for ${t.name} was not valid JSON: ${t.json}`);
              }
            }
            yield { type: "tool_call", id: t.id, name: t.name as ToolName, input: parsed };
          } else {
            const text = stripper.flush();
            if (text) yield { type: "text", text };
          }
        } else if (ev.messageStop) {
          stopReason = ev.messageStop.stopReason ?? stopReason;
        } else if (ev.metadata?.usage) {
          usage = {
            inputTokens: ev.metadata.usage.inputTokens ?? 0,
            outputTokens: ev.metadata.usage.outputTokens ?? 0,
          };
          const text = stripper.flush();
          if (text) yield { type: "text", text };
          doneYielded = true;
          yield { type: "done", stopReason, usage };
        }
      }
      if (!doneYielded) {
        const text = stripper.flush();
        if (text) yield { type: "text", text };
        yield { type: "done", stopReason };
      }
    } catch (err) {
      if (req.signal.aborted || abort.signal.aborted) return;
      throw err;
    } finally {
      req.signal.removeEventListener("abort", onAbort);
    }
  }
}
