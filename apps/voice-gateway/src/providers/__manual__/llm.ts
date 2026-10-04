import { ASSISTANT_TOOLS } from "@muxaris/shared";
import { BedrockLlm, toBedrockTools } from "../bedrock-llm.js";

const llm = new BedrockLlm({
  modelId: process.env["BEDROCK_MODEL_ID"] ?? "global.amazon.nova-2-lite-v1:0",
  region: process.env["AWS_REGION"] ?? "ap-south-1",
});
for await (const d of llm.stream({
  system: "You are Muxaris, a dental clinic receptionist. Today is 2026-10-04 (Asia/Kolkata).",
  messages: [{ role: "user", content: [{ text: "I need a teeth cleaning tomorrow afternoon." }] }],
  tools: toBedrockTools(ASSISTANT_TOOLS),
  signal: new AbortController().signal,
})) {
  console.log(JSON.stringify(d));
}
