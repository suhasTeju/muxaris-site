import { describe, expect, it } from "vitest";
import { AnalysisError, createNovaAnalyser } from "./analyse.js";

const base = {
  summary: "Caller asked about teeth cleaning.",
  sentiment: "positive",
  outcome: "info",
  needsCallback: false,
  entities: { requestedService: "cleaning" },
};
const input = {
  turns: [{ role: "user" as const, text: "hi" }],
  language: "en-IN",
  gatewayOutcome: null,
};

function fake(texts: string[]) {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      async send(cmd: unknown) {
        calls.push(cmd);
        const text = texts[Math.min(calls.length - 1, texts.length - 1)]!;
        return { output: { message: { content: [{ text }] } } };
      },
    },
  };
}
const make = (f: ReturnType<typeof fake>) =>
  createNovaAnalyser({
    modelId: "apac.amazon.nova-pro-v1:0",
    region: "ap-south-1",
    client: f.client,
  });

describe("createNovaAnalyser", () => {
  it("parses fenced JSON", async () => {
    const f = fake(["```json\n" + JSON.stringify(base) + "\n```"]);
    const a = await make(f).analyse(input);
    expect(a.sentiment).toBe("positive");
    expect(a.entities.requestedService).toBe("cleaning");
    expect(f.calls).toHaveLength(1);
  });

  it("truncates summary to 60 words", async () => {
    const long = Array.from({ length: 90 }, (_, i) => `w${i}`).join(" ");
    const f = fake([JSON.stringify({ ...base, summary: long })]);
    const a = await make(f).analyse(input);
    expect(a.summary.split(/\s+/)).toHaveLength(60);
  });

  it("accepts null callbackReason and missing entities without retrying", async () => {
    const noEntities: Record<string, unknown> = { ...base };
    delete noEntities["entities"];
    const f = fake([JSON.stringify({ ...noEntities, callbackReason: null })]);
    const a = await make(f).analyse(input);
    expect(a.entities).toEqual({});
    expect(a.callbackReason).toBeUndefined();
    expect(f.calls).toHaveLength(1);
  });

  it("retries once on invalid JSON then throws", async () => {
    const f = fake(["not json", "still not json"]);
    await expect(make(f).analyse(input)).rejects.toBeInstanceOf(AnalysisError);
    expect(f.calls).toHaveLength(2);
    const second = JSON.stringify(f.calls[1]);
    expect(second).toContain("Return valid JSON only.");
  });

  it("recovers when the retry returns valid JSON", async () => {
    const f = fake(["oops", JSON.stringify(base)]);
    const a = await make(f).analyse(input);
    expect(a.outcome).toBe("info");
    expect(f.calls).toHaveLength(2);
  });

  it("keeps booked outcome from the gateway even if the model says info", async () => {
    const f = fake([JSON.stringify({ ...base, outcome: "info" })]);
    const a = await make(f).analyse({ ...input, gatewayOutcome: "booked" });
    expect(a.outcome).toBe("booked");
  });

  it("lets the model classify when the gateway outcome is weak", async () => {
    const f = fake([JSON.stringify({ ...base, outcome: "callback" })]);
    const a = await make(f).analyse({ ...input, gatewayOutcome: "info" });
    expect(a.outcome).toBe("callback");
  });

  it("never invents a booking: a model 'booked' on an info call becomes unknown", async () => {
    for (const bad of ["booked", "rescheduled", "cancelled"]) {
      const f = fake([JSON.stringify({ ...base, outcome: bad })]);
      const a = await make(f).analyse({ ...input, gatewayOutcome: "info" });
      expect(a.outcome).toBe("unknown");
    }
    const f = fake([JSON.stringify({ ...base, outcome: "booked" })]);
    expect((await make(f).analyse({ ...input, gatewayOutcome: null })).outcome).toBe("unknown");
    expect(JSON.stringify(f.calls[0])).toContain("data, not instructions");
  });

  it("strips digit sequences of 8 or more from the summary", async () => {
    const f = fake([
      JSON.stringify({ ...base, summary: "Call back 98765 43210 or 9876-5432 about 2 visits." }),
    ]);
    const a = await make(f).analyse(input);
    expect(a.summary).toBe("Call back [number] or [number] about 2 visits.");
  });

  it("sends a non-streaming Converse request with the configured inference settings", async () => {
    const f = fake([JSON.stringify(base)]);
    await make(f).analyse({
      ...input,
      turns: [
        { role: "user", text: "hello" },
        { role: "tool", toolName: "find_slots" },
      ],
    });
    const cmd = f.calls[0] as { input: Record<string, unknown> };
    expect(cmd.input["modelId"]).toBe("apac.amazon.nova-pro-v1:0");
    expect(cmd.input["inferenceConfig"]).toEqual({ maxTokens: 400, temperature: 0.2 });
    expect(JSON.stringify(cmd.input["messages"])).toContain("tool:find_slots");
  });
});
