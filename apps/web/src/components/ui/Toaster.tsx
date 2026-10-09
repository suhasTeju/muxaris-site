"use client";

import Link from "next/link";
import { Check, CircleAlert, Info, X, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "good" | "bad" | "info";

export interface ToastOptions {
  /** good (default): teal check. bad: rose alert. info: blue info. */
  tone?: ToastTone;
  /** Optional link after the text, in #7fe6dc (e.g. "View" → /app/appointments). */
  action?: { label: string; href: string };
}

export interface ToastItem extends Required<Pick<ToastOptions, "tone">> {
  id: number;
  text: string;
  action?: { label: string; href: string };
}

/** Auto-dismiss delay and stack depth from the design's shell script. */
export const TOAST_MS = 4200;
const MAX_TOASTS = 3;

const TONE: Record<ToastTone, { icon: LucideIcon; tile: string }> = {
  good: { icon: Check, tile: "#7fe6dc" },
  bad: { icon: CircleAlert, tile: "#f7a8bb" },
  info: { icon: Info, tile: "#cfe9ff" },
};

interface ToastApi {
  toast: (text: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const noop: ToastApi = { toast: () => undefined, dismiss: () => undefined };
const Ctx = createContext<ToastApi | null>(null);

/**
 * `const { toast } = useToast(); toast("Patient added")`. Outside a ToastProvider it is a no-op,
 * so components render in isolation (tests, public pages) without a provider.
 */
export function useToast(): ToastApi {
  return useContext(Ctx) ?? noop;
}

/** Holds the toast queue and renders the stack. The app shell mounts one around every page. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (text: string, options: ToastOptions = {}) => {
      const id = ++seq.current;
      const item: ToastItem = { id, text, tone: options.tone ?? "good" };
      if (options.action) item.action = options.action;
      // Keep the two newest and add this one, as the design does.
      setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), item]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const live = timers.current;
    return () => {
      live.forEach(clearTimeout);
      live.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

/**
 * The stack itself: fixed 24px from the bottom-right, newest last, aria-live="polite".
 * Each toast is a dark glass pill with a tone tile, text, optional action link and a dismiss button.
 */
export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-[24px] bottom-[24px] z-[200] flex flex-col items-end gap-[10px] max-sm:right-[16px] max-sm:bottom-[16px] max-sm:left-[16px]"
    >
      {toasts.map((t) => {
        const { icon: Icon, tile } = TONE[t.tone];
        return (
          <div
            key={t.id}
            role="status"
            className="bg-glass text-glass-text shadow-toast animate-mx-toast pointer-events-auto flex max-w-[420px] min-w-[280px] items-center gap-[12px] rounded-14 py-[12px] pr-[12px] pl-[14px] text-[14px] leading-[1.5] backdrop-blur-[12px] max-sm:min-w-0"
          >
            <span
              aria-hidden="true"
              className="text-ink grid size-[22px] shrink-0 place-items-center rounded-7"
              style={{ background: tile }}
            >
              <Icon size={13} />
            </span>
            <span className="flex-1">{t.text}</span>
            {t.action ? (
              <Link
                href={t.action.href}
                className="text-accent-bright hover:text-accent-bright text-[13.5px] font-semibold"
              >
                {t.action.label}
              </Link>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => onDismiss(t.id)}
              className="text-glass-muted grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-7 border-0 bg-transparent hover:bg-white/[0.08] hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
