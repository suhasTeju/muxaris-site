"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  Btn,
  ErrorNote,
  Field,
  SelectField,
  StepShell,
  TextField,
  errMsg,
  inputCls,
  type Call,
} from "./ui";

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
}: {
  call: Call;
  clinicId: string;
  clinicName: string;
  languages: LanguageCode[];
  onBack: () => Promise<void>;
  onContinue: () => Promise<void>;
}) {
  const langs = LANGUAGES.filter((l) => languages.includes(l.code));
  const [name, setName] = useState("Muxaris");
  const [greeting, setGreeting] = useState<Partial<Record<LanguageCode, string>>>(() =>
    Object.fromEntries(langs.map((l) => [l.code, fillGreeting(l.code, clinicName)])),
  );
  const [voices, setVoices] = useState<Partial<Record<LanguageCode, BulbulV3Speaker>>>({});
  const [handoff, setHandoff] = useState("");
  const [faq, setFaq] = useState<Faq[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState<LanguageCode | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
        if (a.handoffNumber) setHandoff(a.handoffNumber);
        if (a.faq?.length) setFaq(a.faq);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [call]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const voiceOf = (code: LanguageCode) => voices[code] ?? DEFAULT_SPEAKER;

  async function preview(code: LanguageCode) {
    const text = (greeting[code] ?? "").trim().slice(0, 300);
    if (!text) {
      setPreviewErr("Write a greeting first.");
      return;
    }
    setPreviewErr(null);
    setPreviewing(code);
    try {
      const req = buildRequest(
        "/v1/assistant/preview",
        { method: "POST", clinicId, body: { text, language: code, speaker: voiceOf(code) } },
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
      const url = URL.createObjectURL(await res.blob());
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audioRef.current = audio;
      await audio.play();
    } catch (e) {
      setPreviewErr(e instanceof ApiError ? e.message : "Could not play the preview.");
    } finally {
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
        footer={
          <>
            <Btn variant="ghost" onClick={() => void onBack()}>
              Back
            </Btn>
            <Btn type="submit" busy={busy}>
              Continue
            </Btn>
          </>
        }
      >
        <TextField
          label="Assistant name"
          value={name}
          error={errors.name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-ink text-sm font-medium">Greeting and voice</p>
            <Btn
              variant="secondary"
              onClick={() =>
                setGreeting(
                  Object.fromEntries(langs.map((l) => [l.code, fillGreeting(l.code, clinicName)])),
                )
              }
            >
              Generate from template
            </Btn>
          </div>
          {langs.map((l) => (
            <div key={l.code} className="border-line space-y-3 rounded-xl border p-4">
              <Field label={`${l.label} greeting`} error={errors[`greeting-${l.code}`]}>
                {(a) => (
                  <textarea
                    {...a}
                    rows={3}
                    maxLength={300}
                    value={greeting[l.code] ?? ""}
                    onChange={(e) => setGreeting({ ...greeting, [l.code]: e.target.value })}
                    className={inputCls}
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-40 flex-1">
                  <SelectField
                    label={`${l.label} voice`}
                    value={voiceOf(l.code)}
                    onChange={(e) =>
                      setVoices({ ...voices, [l.code]: e.target.value as BulbulV3Speaker })
                    }
                    options={BULBUL_V3_SPEAKERS.map((s) => ({
                      value: s,
                      label: s[0]!.toUpperCase() + s.slice(1),
                    }))}
                  />
                </div>
                <Btn
                  variant="secondary"
                  busy={previewing === l.code}
                  onClick={() => void preview(l.code)}
                >
                  Preview
                </Btn>
              </div>
            </div>
          ))}
          {previewErr ? (
            <p role="alert" className="text-danger text-sm">
              {previewErr}
            </p>
          ) : null}
        </div>

        <TextField
          label="Handoff phone number (optional)"
          type="tel"
          inputMode="tel"
          value={handoff}
          error={errors.handoffNumber}
          hint="Calls the assistant cannot handle are passed to this number."
          onChange={(e) => setHandoff(e.target.value)}
        />

        <div className="space-y-3">
          <p className="text-ink text-sm font-medium">Common questions (optional)</p>
          {faq.map((f, i) => (
            <div key={i} className="border-line space-y-3 rounded-xl border p-4">
              <TextField
                label="Question"
                value={f.q}
                maxLength={200}
                onChange={(e) =>
                  setFaq(faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))
                }
              />
              <Field label="Answer">
                {(a) => (
                  <textarea
                    {...a}
                    rows={2}
                    maxLength={1000}
                    value={f.a}
                    onChange={(e) =>
                      setFaq(faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))
                    }
                    className={inputCls}
                  />
                )}
              </Field>
              <Btn variant="ghost" onClick={() => setFaq(faq.filter((_, j) => j !== i))}>
                Remove
              </Btn>
            </div>
          ))}
          {errors.faq ? (
            <p role="alert" className="text-danger text-sm">
              {errors.faq}
            </p>
          ) : null}
          {faq.length < 30 ? (
            <Btn variant="secondary" onClick={() => setFaq([...faq, { q: "", a: "" }])}>
              Add a question
            </Btn>
          ) : null}
        </div>
        <ErrorNote message={error} />
      </StepShell>
    </form>
  );
}
