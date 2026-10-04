import type { ConverseStreamOutput } from "@aws-sdk/client-bedrock-runtime";
import { ASSISTANT_TOOLS } from "@muxaris/shared";
import { describe, expect, it, vi } from "vitest";
import { BedrockLlm, ThinkingStripper, toBedrockTools } from "./bedrock-llm.js";
import type { LlmDelta } from "./types.js";

function makeLlm(events: ConverseStreamOutput[], onSend?: (cmd: unknown) => void) {
  const send = vi.fn(async (cmd: unknown) => {
    onSend?.(cmd);
    return {
      stream: (async function* () {
        for (const e of events) yield e;
      })(),
    };
  });
  return { llm: new BedrockLlm({ modelId: "m", region: "ap-south-1", client: { send } }), send };
}
async function collect(it: AsyncIterable<LlmDelta>): Promise<LlmDelta[]> {
  const out: LlmDelta[] = [];
  for await (const d of it) out.push(d);
  return out;
}
const text = (t: string, i = 0): ConverseStreamOutput => ({
  contentBlockDelta: { delta: { text: t }, contentBlockIndex: i },
});
const req = (signal = new AbortController().signal) => ({
  system: "sys",
  messages: [{ role: "user" as const, content: [{ text: "hi" }] }],
  tools: toBedrockTools(ASSISTANT_TOOLS),
  signal,
});
const meta: ConverseStreamOutput = {
  metadata: {
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    metrics: { latencyMs: 1 },
  },
};

describe("toBedrockTools", () => {
  it("wraps every tool as a toolSpec with json schema", () => {
    const t = toBedrockTools(ASSISTANT_TOOLS);
    expect(t).toHaveLength(ASSISTANT_TOOLS.length);
    expect(t[0]).toEqual({
      toolSpec: {
        name: ASSISTANT_TOOLS[0]!.name,
        description: ASSISTANT_TOOLS[0]!.description,
        inputSchema: { json: ASSISTANT_TOOLS[0]!.inputSchema },
      },
    });
  });
});

describe("ThinkingStripper", () => {
  const run = (chunks: string[]) => {
    const s = new ThinkingStripper();
    return chunks.map((c) => s.push(c)).join("") + s.flush();
  };
  it("passes plain text through immediately", () => {
    const s = new ThinkingStripper();
    expect(s.push("Hello there. ")).toBe("Hello there. ");
  });
  it("strips a block split across arbitrary delta boundaries", () => {
    const full = "<thinking> I need to check </thinking>Sure, one moment.";
    for (let cut1 = 1; cut1 < full.length; cut1 += 3) {
      for (let cut2 = cut1 + 1; cut2 < full.length; cut2 += 5) {
        expect(run([full.slice(0, cut1), full.slice(cut1, cut2), full.slice(cut2)])).toBe(
          "Sure, one moment.",
        );
      }
    }
  });
  it("matches the Nova Pro token stream", () => {
    expect(run(["<thinking", ">", " I", " need", "</thinking", ">\n"])).toBe("\n");
  });
  it("preserves whitespace after the closing tag", () => {
    expect(run(["Hi<thinking>x</thinking>", " there"])).toBe("Hi there");
  });
  it("never emits text inside an unclosed tag", () => {
    expect(run(["Hi <thinking>secret", " more"])).toBe("Hi ");
  });
  it("holds back only a partial prefix and releases it when it is not a tag", () => {
    const s = new ThinkingStripper();
    expect(s.push("a <think")).toBe("a ");
    expect(s.push("er")).toBe("<thinker");
    expect(run(["x <", "b>"])).toBe("x <b>");
  });
});

describe("BedrockLlm", () => {
  it("sends the expected command", async () => {
    const { llm, send } = makeLlm([{ messageStop: { stopReason: "end_turn" } }, meta]);
    await collect(llm.stream(req()));
    const cmd = send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(cmd.input).toMatchObject({
      modelId: "m",
      system: [{ text: "sys" }],
      inferenceConfig: { maxTokens: 400, temperature: 0.3 },
    });
    expect((cmd.input["toolConfig"] as { tools: unknown[] }).tools).toHaveLength(
      ASSISTANT_TOOLS.length,
    );
  });

  it("accumulates tool input fragments per block index and parses at stop", async () => {
    const { llm } = makeLlm([
      { messageStart: { role: "assistant" } },
      text("<thinking", 0),
      text("> plan </thinking>\n", 0),
      { contentBlockStop: { contentBlockIndex: 0 } },
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: "t1", name: "find_slots" } },
          contentBlockIndex: 1,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"date":"2026-' } },
          contentBlockIndex: 1,
        },
      },
      { contentBlockDelta: { delta: { toolUse: { input: '10-05"}' } }, contentBlockIndex: 1 } },
      { contentBlockStop: { contentBlockIndex: 1 } },
      { messageStop: { stopReason: "tool_use" } },
      meta,
    ]);
    expect(await collect(llm.stream(req()))).toEqual([
      { type: "text", text: "\n" },
      { type: "tool_call", id: "t1", name: "find_slots", input: { date: "2026-10-05" } },
      { type: "done", stopReason: "tool_use", usage: { inputTokens: 10, outputTokens: 5 } },
    ]);
  });

  it("yields empty input for malformed or empty tool JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tool = (i: number, json: string): ConverseStreamOutput[] => [
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: `t${i}`, name: "end_call" } },
          contentBlockIndex: i,
        },
      },
      ...(json
        ? [{ contentBlockDelta: { delta: { toolUse: { input: json } }, contentBlockIndex: i } }]
        : []),
      { contentBlockStop: { contentBlockIndex: i } },
    ];
    const { llm } = makeLlm([
      ...tool(0, '{"a":'),
      ...tool(1, ""),
      { messageStop: { stopReason: "tool_use" } },
    ]);
    const out = await collect(llm.stream(req()));
    expect(out.slice(0, 2)).toEqual([
      { type: "tool_call", id: "t0", name: "end_call", input: {} },
      { type: "tool_call", id: "t1", name: "end_call", input: {} },
    ]);
    expect(out[2]).toEqual({ type: "done", stopReason: "tool_use" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("streams text as it arrives and ends with done", async () => {
    const { llm } = makeLlm([
      text("Hello "),
      text("world."),
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: "end_turn" } },
      meta,
    ]);
    expect(await collect(llm.stream(req()))).toEqual([
      { type: "text", text: "Hello " },
      { type: "text", text: "world." },
      { type: "done", stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 5 } },
    ]);
  });

  it("skips unknown tool names and still yields done", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { llm } = makeLlm([
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: "t", name: "rm_rf" } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"x":"SECRET"}' } },
          contentBlockIndex: 0,
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: "tool_use" } },
    ]);
    expect(await collect(llm.stream(req()))).toEqual([{ type: "done", stopReason: "tool_use" }]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET");
    warn.mockRestore();
  });

  it("does not log tool input on malformed JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { llm } = makeLlm([
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: "t", name: "end_call" } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"name":"SECRET' } },
          contentBlockIndex: 0,
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
    ]);
    await collect(llm.stream(req()));
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET");
    warn.mockRestore();
  });

  it("stops iterating when the signal aborts", async () => {
    const ac = new AbortController();
    let aborted = false;
    let returned = false;
    const send = vi.fn(async (_cmd: unknown, o?: { abortSignal?: AbortSignal }) => {
      o?.abortSignal?.addEventListener("abort", () => (aborted = true));
      return {
        stream: (async function* () {
          try {
            yield text("one ");
            ac.abort();
            yield text("two ");
            yield meta;
          } finally {
            returned = true;
          }
        })(),
      };
    });
    const llm = new BedrockLlm({ modelId: "m", region: "r", client: { send } });
    const out = await collect(llm.stream(req(ac.signal)));
    expect(out).toEqual([{ type: "text", text: "one " }]);
    expect(aborted).toBe(true);
    expect(returned).toBe(true);
  });

  it("propagates non-abort errors", async () => {
    const send = vi.fn(async () => {
      throw new Error("ValidationException");
    });
    const llm = new BedrockLlm({ modelId: "m", region: "r", client: { send } });
    await expect(collect(llm.stream(req()))).rejects.toThrow("ValidationException");
  });
});
