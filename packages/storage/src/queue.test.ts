import type { SQSClient } from "@aws-sdk/client-sqs";
import { ChangeMessageVisibilityCommand } from "@aws-sdk/client-sqs";
import { describe, expect, it } from "vitest";
import { FakeQueue } from "./fakes.js";
import { createSqsQueue } from "./queue.js";

describe("extendVisibility", () => {
  it("sends ChangeMessageVisibility with the receipt handle and seconds", async () => {
    const sent: unknown[] = [];
    const client = { send: async (c: unknown) => void sent.push(c) } as unknown as SQSClient;
    const q = createSqsQueue({
      url: "https://sqs/q",
      region: "ap-south-1",
      parse: (r) => r,
      client,
    });
    await q.extendVisibility("rh-1", 120);
    expect(sent).toHaveLength(1);
    const cmd = sent[0] as ChangeMessageVisibilityCommand;
    expect(cmd).toBeInstanceOf(ChangeMessageVisibilityCommand);
    expect(cmd.input).toEqual({
      QueueUrl: "https://sqs/q",
      ReceiptHandle: "rh-1",
      VisibilityTimeout: 120,
    });
  });
  it("the fake records extensions as a no-op", async () => {
    const q = new FakeQueue<{ n: number }>();
    await q.extendVisibility("h-1", 60);
    expect(q.extended).toEqual([{ handle: "h-1", seconds: 60 }]);
  });
});
