"use client";

import { useEffect, useRef, useState } from "react";
import { formatIndianPhone } from "@/lib/phone";
import {
  BULBUL_V3_SPEAKERS,
  LANGUAGES,
  assistantProfileBody,
  type BulbulV3Speaker,
  type LanguageCode,
} from "@muxaris/shared";
import { ApiError, buildRequest } from "@/lib/api";
import { getAccessToken } from "@/lib/api-client";
import { DEFAULT_SPEAKER, fillGreeting } from "@/lib/onboarding";
import { Play, Plus, Square, WandSparkles } from "lucide-react";
import { Button, Input, Select, Textarea, cn } from "@/components/ui";
import {
  Field,
  StepFooter,
  StepShell,
  StepSubheading,
  TextField,
  errMsg,
  useStepBusy,
  type Call,
} from "./ui";

/** Fetches the spoken greeting as audio. The wizard's previews inject their own. */
export type VoicePreview = (
  clinicId: string,
  body: { text: string; language: LanguageCode; speaker: BulbulV3Speaker },
) => Promise<Blob>;

export const fetchGreetingAudio: VoicePreview = async (clinicId, body) => {
  const req = buildRequest(
    "/v1/assistant/preview",
    { method: "POST", clinicId, body },
    { token: await getAccessToken() },
  );
  const res = await fetch(req.url, req.init);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      "preview_failed",
      res.status === 503
        ? "Voice preview is not available right now."
        : res.status === 429
          ? "Too many previews. Try again later."
          : "Could not play the preview. Please try again.",
    );
  }
  return res.blob();
};

interface Faq {
  q: string;
  a: string;
}

export function StepAssistant({
  call,
  clinicId,
  clinicName,
  languages,
  onBack,
  onContinue,
  voicePreview = fetchGreetingAudio,
}: {
  call: Call;
  clinicId: string;
  clinicName: string;
  languages: LanguageCode[];
  onBack: () => Promise<void>;
  onContinue: () => Promise<void>;
  voicePreview?: VoicePreview;
}) {
  const langs = LANGUAGES.filter((l) => languages.includes(l.code));
  const [name, setName] = useState("Muxaris");
  const [greeting, setGreeting] = useState<Partial<Record<LanguageCode, string>>>(() =>
    Object.fromEntries(langs.map((l) => [l.code, fillGreeting(l.code, clinicName)])),
  );
  const [voices, setVoices] = useState<Partial<Record<LanguageCode, BulbulV3Speaker>>>({});
  const [handoff, setHandoff] = useState("");
  // The design starts with one empty question; blank rows are dropped on save.
  const [faq, setFaq] = useState<Faq[]>([{ q: "", a: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useStepBusy(false);
  const [previewing, setPreviewing] = useState<LanguageCode | null>(null);
  const [previewErr, setPreviewErr] = useState<Partial<Record<LanguageCode, string>>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped on every start and stop, so a late response never plays over a newer action.
  const previewSeq = useRef(0);

  useEffect(() => {
    let live = true;
    call<{
      assistant: {
        name?: string;
        greeting?: Record<string, string>;
        voices?: Record<string, BulbulV3Speaker>;
        handoffNumber?: string | null;
        faq?: Faq[];
      };
    }>("/v1/assistant")
      .then(({ assistant: a }) => {
        if (!live) return;
        if (a.name) setName(a.name);
        if (a.greeting && Object.keys(a.greeting).length)
          setGreeting((g) => ({ ...g, ...a.greeting }));
        if (a.voices) setVoices(a.voices);
        if (a.handoffNumber) setHandoff(formatIndianPhone(a.handoffNumber));
        if (a.faq?.length) setFaq(a.faq);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [call]);

  const urlRef = useRef<string | null>(null);
  const dropAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };
  useEffect(
    () => () => {
      previewSeq.current++;
      dropAudio();
    },
    [],
  );

  const voiceOf = (code: LanguageCode) => voices[code] ?? DEFAULT_SPEAKER;

  const setErrFor = (code: LanguageCode, msg: string | undefined) =>
    setPreviewErr((m) => ({ ...m, [code]: msg }));

  function stopPreview() {
    previewSeq.current++;
    dropAudio();
    setPreviewing(null);
  }

  /** Plays the greeting in its voice; a second click while it loads or plays stops it. */
  async function preview(code: LanguageCode) {
    if (previewing === code) return stopPreview();
    const text = (greeting[code] ?? "").trim().slice(0, 300);
    if (!text) {
      setErrFor(code, "Write a greeting first.");
      return;
    }
    setErrFor(code, undefined);
    dropAudio();
    const seq = ++previewSeq.current;
    setPreviewing(code);
    try {
      const blob = await voicePreview(clinicId, { text, language: code, speaker: voiceOf(code) });
      if (seq !== previewSeq.current) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (seq === previewSeq.current) setPreviewing(null);
      };
      await audio.play();
    } catch (e) {
      if (seq !== previewSeq.current) return;
      setErrFor(code, e instanceof ApiError ? e.message : "Could not play the preview.");
      setPreviewing(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const faqRows = faq.filter((f) => f.q.trim() || f.a.trim());
    const body = {
      name,
      greeting: Object.fromEntries(langs.map((l) => [l.code, greeting[l.code] ?? ""])),
      voices: Object.fromEntries(langs.map((l) => [l.code, voiceOf(l.code)])),
      ...(handoff.trim() ? { handoffNumber: handoff.trim() } : {}),
      faq: faqRows,
    };
    const parsed = assistantProfileBody.safeParse(body);
    if (!parsed.success) {
      const m: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] === "greeting" ? `greeting-${String(i.path[1])}` : String(i.path[0]);
        m[k] ??= i.message;
      }
      if (m.name) m.name = "Give the assistant a name (up to 60 characters)";
      for (const k of Object.keys(m))
        if (k.startsWith("greeting-")) m[k] = "Greeting needs 1 to 300 characters";
      if (m.faq)
        m.faq =
          "Each question and answer needs text (questions up to 200, answers up to 1000 characters)";
      setErrors(m);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await call("/v1/assistant", { method: "PUT", body });
      await onContinue();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepShell
        title="Meet your assistant"
        lead="How it introduces itself, and how it sounds in each language."
        error={error}
        gap="gap-[22px]"
        footer={<StepFooter onBack={() => void onBack()} busy={busy} />}
      >
        <div className="flex flex-wrap items-end gap-[14px]">
          <TextField
            label="Assistant name"
            className="min-w-[220px] flex-1"
            value={name}
            error={errors.name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            variant="secondary"
            size={44}
            icon={WandSparkles}
            iconSize={14}
            onClick={() =>
              setGreeting(
                Object.fromEntries(langs.map((l) => [l.code, fillGreeting(l.code, clinicName)])),
              )
            }
            className="rounded-10 px-[14px] text-[14px]"
          >
            Generate from template
          </Button>
        </div>

        <div className="flex flex-col gap-[12px]">
          {langs.map((l) => {
            const playing = previewing === l.code;
            const err = previewErr[l.code];
            return (
              <div
                key={l.code}
                className={cn(
                  "bg-subtle flex flex-col gap-[10px] rounded-16 border p-[16px] transition-[border-color] duration-200 motion-reduce:transition-none",
                  playing ? "border-teal-border" : "border-line",
                )}
              >
                <Field label={`${l.label} greeting`} error={errors[`greeting-${l.code}`]}>
                  {(a) => (
                    <Textarea
                      {...a}
                      size="lg"
                      rows={2}
                      maxLength={300}
                      value={greeting[l.code] ?? ""}
                      onChange={(e) => setGreeting({ ...greeting, [l.code]: e.target.value })}
                      className="text-[15px] leading-[1.5]"
                    />
                  )}
                </Field>
                <div className="flex flex-wrap items-center gap-[10px] max-sm:flex-col max-sm:items-start">
                  <label className="text-muted flex items-center gap-[8px] text-[13px]">
                    {l.label} voice
                    <Select
                      size={34}
                      value={voiceOf(l.code)}
                      onChange={(e) =>
                        setVoices({ ...voices, [l.code]: e.target.value as BulbulV3Speaker })
                      }
                      className="text-ink w-auto rounded-9"
                    >
                      {BULBUL_V3_SPEAKERS.map((v) => (
                        <option key={v} value={v}>
                          {v[0]!.toUpperCase() + v.slice(1)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <span className="contents max-sm:flex max-sm:items-center max-sm:gap-[10px]">
                    <Button
                      size={34}
                      icon={playing ? Square : Play}
                      iconSize={12}
                      aria-pressed={playing}
                      onClick={() => void preview(l.code)}
                      className={cn(
                        "gap-[8px] font-medium shadow-none",
                        playing && "bg-teal hover:bg-teal",
                      )}
                    >
                      Preview
                    </Button>
                    {playing ? <VoiceBars /> : null}
                  </span>
                  {err ? (
                    <span role="alert" className="text-rose text-[12.5px]">
                      {err}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <TextField
          label="Handoff phone number (optional)"
          className="max-w-[360px]"
          type="tel"
          inputMode="tel"
          value={handoff}
          error={errors.handoffNumber}
          hint="Calls the assistant cannot handle are passed to this number."
          onChange={(e) => setHandoff(e.target.value)}
        />

        <div className="border-line flex flex-col gap-[12px] border-t pt-[22px]">
          <StepSubheading>Common questions (optional)</StepSubheading>
          {faq.map((f, i) => (
            <div
              key={i}
              className="border-line bg-subtle grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[10px] rounded-14 border p-[14px] max-sm:grid-cols-[minmax(0,1fr)]"
            >
              <div className="flex flex-col gap-[8px]">
                <Input
                  size={40}
                  aria-label="Question"
                  placeholder="Question"
                  maxLength={200}
                  value={f.q}
                  onChange={(e) =>
                    setFaq(faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))
                  }
                  className="px-[12px] text-[14.5px] font-medium"
                />
                <Textarea
                  size="md"
                  rows={2}
                  aria-label="Answer"
                  placeholder="Answer"
                  maxLength={1000}
                  value={f.a}
                  onChange={(e) =>
                    setFaq(faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))
                  }
                  className="px-[12px] py-[9px] leading-[1.5]"
                />
              </div>
              <Button
                variant="danger-ghost"
                size={32}
                onClick={() => setFaq(faq.filter((_, j) => j !== i))}
                className="rounded-9 max-sm:justify-self-end"
              >
                Remove<span className="sr-only"> question {i + 1}</span>
              </Button>
            </div>
          ))}
          {errors.faq ? (
            <span role="alert" className="text-rose text-[12.5px]">
              {errors.faq}
            </span>
          ) : null}
          {faq.length < 30 ? (
            <Button
              variant="secondary"
              size={38}
              icon={Plus}
              iconSize={14}
              onClick={() => setFaq([...faq, { q: "", a: "" }])}
              className="self-start"
            >
              Add a question
            </Button>
          ) : null}
        </div>
      </StepShell>
    </form>
  );
}

/** Four teal bars bouncing while a preview loads and plays (mxBar35, 0.15s apart). */
function VoiceBars() {
  return (
    <span aria-hidden="true" className="flex h-[16px] items-center gap-[2px]">
      {[0, 0.15, 0.3, 0.45].map((delay) => (
        <span
          key={delay}
          className="bg-teal h-[16px] w-[3px] animate-[mxBar35_.9s_ease-in-out_infinite] rounded-[2px] motion-reduce:animate-none"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}
