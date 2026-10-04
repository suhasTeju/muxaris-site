import type { Message, Tool } from "@aws-sdk/client-bedrock-runtime";
import type { LanguageCode, ToolName } from "@muxaris/shared";

export type ConverseMessage = Message;
export type ToolDefinition = Tool;

export interface SttStream {
  sendAudio(pcm16k: Buffer): void;
  end(): void;
  on(ev: "speech_start" | "speech_end", cb: () => void): void;
  on(ev: "transcript", cb: (t: { text: string; language?: string }) => void): void;
  on(ev: "error", cb: (e: Error) => void): void;
  close(): void;
}
export interface SttProvider {
  open(): Promise<SttStream>;
}

export interface TtsUtterance {
  /** PCM16 mono 24 kHz */
  audio: AsyncIterable<Buffer>;
  cancel(): void;
}
export interface TtsProvider {
  /** `warm` is reserved for a future pre-connected socket; currently ignored. */
  speak(
    text: string,
    opts: { language: LanguageCode; speaker: string; warm?: boolean },
  ): TtsUtterance;
}

export type LlmDelta =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: ToolName; input: unknown }
  | {
      type: "done";
      stopReason: string;
      usage?: { inputTokens: number; outputTokens: number };
    };

export interface LlmProvider {
  stream(req: {
    system: string;
    messages: ConverseMessage[];
    tools: ToolDefinition[];
    signal: AbortSignal;
  }): AsyncIterable<LlmDelta>;
}
