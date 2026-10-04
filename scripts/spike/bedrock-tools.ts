// Run: source scripts/lib/aws-guard.sh && npx tsx scripts/spike/bedrock-tools.ts
import { BedrockRuntimeClient, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { ASSISTANT_TOOLS } from "../../packages/shared/src/tools.js";

if (
  process.env.CDK_DEFAULT_ACCOUNT !== "005533348545" ||
  process.env.AWS_PROFILE !== "aws-secondary-account"
) {
  console.error("run via: source scripts/lib/aws-guard.sh first");
  process.exit(1);
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const userText = process.env.USER_TEXT ?? "Hi, I need a teeth cleaning tomorrow afternoon.";
const client = new BedrockRuntimeClient({ region: "ap-south-1" });
const candidates = [
  process.env.BEDROCK_MODEL_ID,
  "apac.anthropic.claude-haiku-4-5-20251001-v1:0",
  "anthropic.claude-haiku-4-5-20251001-v1:0",
  "global.anthropic.claude-haiku-4-5-20251001-v1:0",
].filter(Boolean) as string[];

for (const modelId of candidates) {
  const t0 = performance.now();
  try {
    const out = await client.send(
      new ConverseStreamCommand({
        modelId,
        system: [
          {
            text: `You are Muxaris, the receptionist for Sunrise Dental Care. Use tools to check availability before offering times. Today is ${today} (Asia/Kolkata). Reply in at most two short sentences.`,
          },
        ],
        messages: [{ role: "user", content: [{ text: userText }] }],
        toolConfig: {
          tools: ASSISTANT_TOOLS.map((t) => ({
            toolSpec: {
              name: t.name,
              description: t.description,
              inputSchema: { json: t.inputSchema },
            },
          })),
        },
        inferenceConfig: { maxTokens: 300, temperature: 0.3 },
      }),
    );
    let firstToken = 0;
    let toolName = "";
    let toolInput = "";
    let text = "";
    let stopReason = "";
    for await (const ev of out.stream ?? []) {
      if (!firstToken && (ev.contentBlockDelta || ev.contentBlockStart))
        firstToken = performance.now() - t0;
      if (ev.contentBlockStart?.start?.toolUse)
        toolName = ev.contentBlockStart.start.toolUse.name ?? "";
      if (ev.contentBlockDelta?.delta?.text) text += ev.contentBlockDelta.delta.text;
      if (ev.contentBlockDelta?.delta?.toolUse?.input)
        toolInput += ev.contentBlockDelta.delta.toolUse.input;
      if (ev.messageStop) stopReason = ev.messageStop.stopReason ?? "";
    }
    console.log(
      `OK model=${modelId} first-token=${Math.round(firstToken)} ms total=${Math.round(performance.now() - t0)} ms stopReason=${stopReason}`,
    );
    console.log(`  text="${text}"`);
    console.log(`  toolUse=${toolName ? `${toolName} ${toolInput}` : "(none)"}`);
    if (toolName) {
      try {
        console.log(`  toolInput parsed: ${JSON.stringify(JSON.parse(toolInput))}`);
      } catch (e) {
        console.log(`  toolInput JSON parse FAILED: ${(e as Error).message}`);
      }
    }
    process.exit(0);
  } catch (e) {
    const err = e as Error & { $metadata?: { httpStatusCode?: number } };
    console.log(
      `bedrock-converse failed: status=${err.$metadata?.httpStatusCode ?? "?"} body=${err.name}: ${err.message.slice(0, 200)} (model=${modelId})`,
    );
  }
}
process.exit(1);
