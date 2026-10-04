import { useCallback, useEffect, useRef, useState } from "react";
import type { GatewayEvent } from "@muxaris/shared";
import {
  VoiceClient,
  errorCodeFromGateway,
  type VoiceClientOptions,
  type VoiceError,
  type VoiceErrorCode,
} from "./client.js";

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
  /** Seconds left in the monthly plan, from `ready` (null until known). */
  planSecondsRemaining: number | null;
  error: string | null;
  /** Coarse category of `error` (auth, busy, quota, unsupported, network, internal). */
  errorCode: VoiceErrorCode | null;
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
  const [planSecondsRemaining, setPlanSecondsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<VoiceErrorCode | null>(null);
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
    setPlanSecondsRemaining(null);
    setError(null);
    setErrorCode(null);

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
    client.on("ready", (e) => {
      if (!current()) return;
      if (e.secondsRemaining !== undefined) setSecondsRemaining(e.secondsRemaining);
      setPlanSecondsRemaining(e.planSecondsRemaining ?? null);
    });
    client.on("usage", (e) => current() && setSecondsRemaining(e.secondsRemaining));
    client.on("state", (e) => current() && setState(e.state));
    let gotEnded = false;
    let isLive = false;
    client.on("ended", () => {
      if (!current()) return;
      gotEnded = true;
      setPhase((p) => (p === "error" ? p : "ended"));
      setState(null);
      client.end();
    });
    client.on("error", (e) => {
      if (!current()) return;
      setError(e.message);
      setErrorCode(errorCodeFromGateway(e.code));
      setPhase("error");
    });
    client.on("close", (ev) => {
      if (!current()) return;
      // A close without `ended` that we did not ask for (drop, gateway restart) is not a hang-up.
      const lost = isLive && !gotEnded && stoppedRef.current !== client && ev.code !== 1000;
      setPhase((p) => {
        if (p === "live" && lost) return "error";
        return p === "live" || p === "connecting" ? "ended" : p;
      });
      if (lost) {
        setError((prev) => prev ?? "Connection lost");
        setErrorCode((prev) => prev ?? "network");
      }
    });

    try {
      await client.connect();
      if (current()) {
        isLive = true;
        setPhase("live");
      }
    } catch (e) {
      if (current() && stoppedRef.current !== client) {
        setError((prev) => prev ?? (e instanceof Error ? e.message : String(e)));
        setErrorCode((e as Partial<VoiceError>).errorCode ?? "internal");
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

  return {
    phase,
    state,
    lines,
    tools,
    booking,
    secondsRemaining,
    planSecondsRemaining,
    error,
    errorCode,
    start,
    stop,
  };
}
