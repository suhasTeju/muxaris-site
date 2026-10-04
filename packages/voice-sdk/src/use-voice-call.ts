import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayEvent } from "@muxaris/shared";
import { VoiceClient, type VoiceClientOptions } from "./client.js";

export type CallPhase = "idle" | "connecting" | "live" | "ended" | "error";
export type CallState = "listening" | "thinking" | "speaking" | null;
export type BookingEvent = Extract<GatewayEvent, { type: "booking" }>;
export interface CallLine {
  role: "user" | "assistant";
  text: string;
}
export interface CallTool {
  name: string;
  status: "started" | "done" | "failed";
  summary: string;
}

export interface UseVoiceCall {
  phase: CallPhase;
  state: CallState;
  lines: CallLine[];
  tools: CallTool[];
  booking: BookingEvent | null;
  secondsRemaining: number | null;
  error: string | null;
  start(): Promise<void>;
  stop(): void;
}

export type UseVoiceCallOptions = VoiceClientOptions;

export function useVoiceCall(opts: UseVoiceCallOptions): UseVoiceCall {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [state, setState] = useState<CallState>(null);
  const [lines, setLines] = useState<CallLine[]>([]);
  const [tools, setTools] = useState<CallTool[]>([]);
  const [booking, setBooking] = useState<BookingEvent | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<VoiceClient | null>(null);
  const stoppedRef = useRef<VoiceClient | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback(async () => {
    clientRef.current?.end();
    setPhase("connecting");
    setState(null);
    setLines([]);
    setTools([]);
    setBooking(null);
    setSecondsRemaining(null);
    setError(null);

    const client = new VoiceClient(optsRef.current);
    clientRef.current = client;
    const current = () => clientRef.current === client;

    client.on("transcript", (e) => {
      if (current()) setLines((l) => [...l, { role: e.role, text: e.text }]);
    });
    client.on("tool", (e) => {
      if (!current()) return;
      setTools((prev) => {
        const next = [...prev];
        if (e.status !== "started") {
          for (let i = next.length - 1; i >= 0; i--) {
            const t = next[i];
            if (t && t.name === e.name && t.status === "started") {
              next[i] = { name: e.name, status: e.status, summary: e.summary };
              return next;
            }
          }
        }
        next.push({ name: e.name, status: e.status, summary: e.summary });
        return next;
      });
    });
    client.on("booking", (e) => current() && setBooking(e));
    client.on("usage", (e) => current() && setSecondsRemaining(e.secondsRemaining));
    client.on("state", (e) => current() && setState(e.state));
    client.on("ended", () => {
      if (!current()) return;
      setPhase((p) => (p === "error" ? p : "ended"));
      setState(null);
      client.end();
    });
    client.on("error", (e) => {
      if (!current()) return;
      setError(e.message);
      setPhase("error");
    });
    client.on("close", () => {
      if (current()) setPhase((p) => (p === "live" || p === "connecting" ? "ended" : p));
    });

    try {
      await client.connect();
      if (current()) setPhase("live");
    } catch (e) {
      if (current() && stoppedRef.current !== client) {
        setError((prev) => prev ?? (e instanceof Error ? e.message : String(e)));
        setPhase("error");
      }
    }
  }, []);

  const stop = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    stoppedRef.current = client;
    client.end();
    setState(null);
    setPhase((p) => (p === "error" ? p : "ended"));
  }, []);

  useEffect(
    () => () => {
      clientRef.current?.end();
      clientRef.current = null;
    },
    [],
  );

  return { phase, state, lines, tools, booking, secondsRemaining, error, start, stop };
}
