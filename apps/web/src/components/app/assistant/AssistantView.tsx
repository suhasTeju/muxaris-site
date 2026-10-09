"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Play, Plus, Square, WandSparkles } from "lucide-react";
import {
  BULBUL_V3_SPEAKERS,
  clinicRecordCalls,
  type AssistantProfile,
  type BulbulV3Speaker,
  type Clinic,
  type LanguageCode,
  type Role,
} from "@muxaris/shared";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Segmented,
  Select,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";
import { useApi } from "@/lib/api-client";
import { DEFAULT_SPEAKER } from "@/lib/onboarding";
import { RecordCallsToggle } from "../RecordCallsToggle";
import { languageLabel } from "@/lib/dashboard";
import { languageNative, saveErrorText } from "../settings/format";
import { AssistantTabs } from "./AssistantTabs";
import { CallerPreview } from "./CallerPreview";
import {
  MAX_FAQ,
  MAX_GREETING,
  TONES,
  VOICE_LABEL,
  clinicLanguages,
  draftBody,
  draftFrom,
  sameDraft,
  templateGreeting,
  type AssistantDraft,
  type DraftErrors,
} from "./draft";
import { UnsavedBar } from "./UnsavedBar";
import { fetchVoicePreview, useVoicePreview, type VoicePreviewFetcher } from "./voice-preview";

export interface AssistantViewProps {
  clinic: Clinic;
  role: Role;
  /** null until the profile is first saved. */
  assistant: AssistantProfile | null;
  /** Voice preview source; defaults to POST /v1/assistant/preview. */
  previewVoice?: VoicePreviewFetcher;
}

const SECTION = "flex flex-col gap-[14px] p-[20px]";
const H2 = "m-0 text-[15.5px] font-semibold";

/** /app/assistant: how the assistant introduces itself and sounds, edited as one draft. */
export function AssistantView({
  clinic,
  role,
  assistant: initial,
  previewVoice = fetchVoicePreview,
}: AssistantViewProps) {
  const api = useApi();
  const { toast } = useToast();
  const isOwner = role === "owner";
  const languages = useMemo(() => {
    const l = clinicLanguages(clinic.languages);
    return l.length ? l : (["en-IN"] as LanguageCode[]);
  }, [clinic.languages]);
  const [saved, setSaved] = useState(initial);
  const base = useMemo(() => draftFrom(saved, languages), [saved, languages]);
  const [edit, setEdit] = useState<AssistantDraft | null>(null);
  const d = edit ?? base;
  const dirty = edit !== null && !sameDraft(edit, base);
  const [picked, setPicked] = useState<LanguageCode | null>(null);
  const lang = picked && languages.includes(picked) ? picked : languages[0]!;
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const preview = useVoicePreview(previewVoice);

  const up = (patch: Partial<AssistantDraft>) => setEdit((e) => ({ ...(e ?? base), ...patch }));
  const text = d.greeting[lang] ?? "";
  const voice: BulbulV3Speaker = d.voices[lang] ?? DEFAULT_SPEAKER;

  // Leaving with unsaved edits asks first, as the browser allows.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function pickLanguage(code: LanguageCode) {
    setPicked(code);
    preview.reset();
  }

  function discard() {
    setEdit(null);
    setErrors({});
  }

  async function save() {
    if (!edit) return;
    const r = draftBody(edit, saved, languages);
    if (r.errors) {
      setErrors(r.errors);
      const badLang = languages.find((c) => r.errors.greeting?.[c]);
      if (badLang && !r.errors.greeting?.[lang]) pickLanguage(badLang);
      toast(r.errors.form ?? "Some fields need attention.", { tone: "bad" });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api<{ assistant: AssistantProfile }>("/v1/assistant", {
        method: "PUT",
        body: r.body,
      });
      setSaved(res.assistant);
      setEdit(null);
      toast("Assistant updated");
    } catch (e) {
      toast(saveErrorText(e), { tone: "bad" });
    } finally {
      setBusy(false);
    }
  }

  const playing = preview.status === "playing";
  const stopVisible = preview.status !== "idle";

  return (
    <>
      <div className="animate-mx-in flex flex-col gap-[18px] pb-[40px]">
        <div className="flex flex-col gap-[14px]">
          <PageHeader
            title="Assistant"
            subtitle="How it introduces itself, and how it sounds in each language."
          />
          <AssistantTabs current="configure" />
        </div>

        {!isOwner ? (
          <div className="bg-chip text-ink-2 flex items-center gap-[10px] rounded-12 px-[14px] py-[12px] text-[13.5px]">
            <Lock size={14} aria-hidden="true" className="shrink-0" />
            Only the clinic owner can change this.
          </div>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-[16px] lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-[14px]">
            <Card aria-labelledby="asst-identity" className="flex flex-col gap-[16px] p-[20px]">
              <h2 id="asst-identity" className={H2}>
                Identity
              </h2>
              <div className="grid grid-cols-1 items-end gap-[14px] sm:grid-cols-[minmax(0,1fr)_auto]">
                <Field label="Assistant name" error={errors.name}>
                  <Input
                    size={42}
                    maxLength={60}
                    value={d.name}
                    disabled={!isOwner}
                    onChange={(e) => up({ name: e.target.value })}
                    className="text-[15px]"
                  />
                </Field>
                <div className="flex flex-col gap-[6px]">
                  <span aria-hidden="true" className="text-ink-2 text-[13px] font-medium">
                    Tone
                  </span>
                  <fieldset disabled={!isOwner} className="m-0 min-w-0 border-0 p-0">
                    <Segmented
                      role="radiogroup"
                      aria-label="Tone"
                      size={34}
                      track="plain"
                      items={TONES.map((t) => ({ id: t.id, label: t.label }))}
                      value={d.tone}
                      onChange={(tone) => up({ tone })}
                    />
                  </fieldset>
                </div>
              </div>
            </Card>

            <Card aria-labelledby="asst-greetings" className={SECTION}>
              <div className="flex items-center justify-between gap-[12px]">
                <h2 id="asst-greetings" className={H2}>
                  Greetings
                </h2>
                {isOwner ? (
                  <Button
                    variant="secondary"
                    size={32}
                    icon={WandSparkles}
                    onClick={() =>
                      up({
                        greeting: Object.fromEntries(
                          languages.map((c) => [c, templateGreeting(c, clinic.name)]),
                        ),
                      })
                    }
                  >
                    Generate from template
                  </Button>
                ) : null}
              </div>
              <div role="tablist" aria-label="Language" className="flex flex-wrap gap-[6px]">
                {languages.map((code) => {
                  const on = code === lang;
                  return (
                    <button
                      key={code}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      aria-label={`${languageNative(code)} (${languageLabel(code)})`}
                      onClick={() => pickLanguage(code)}
                      className={cn(
                        "inline-flex h-[34px] cursor-pointer items-center gap-[8px] rounded-9 border px-[12px] text-[13.5px] font-medium",
                        on ? "border-ink bg-ink text-white" : "border-field bg-surface text-ink-2",
                        errors.greeting?.[code] && !on && "border-rose-invalid",
                      )}
                    >
                      {languageNative(code)}
                      <span className="font-mono text-[11px] opacity-70">
                        {code.slice(0, 2).toUpperCase()}
                      </span>
                    </button>
                  );
                })}
              </div>
              <Field
                label={`${languageLabel(lang)} greeting`}
                counter={`${text.length}/${MAX_GREETING}`}
                error={errors.greeting?.[lang]}
              >
                <Textarea
                  size="lg"
                  rows={3}
                  maxLength={MAX_GREETING}
                  value={text}
                  disabled={!isOwner}
                  onChange={(e) => up({ greeting: { ...d.greeting, [lang]: e.target.value } })}
                  className="py-[11px] text-[16px] leading-[1.55]"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-[10px]">
                <label className="text-muted flex items-center gap-[8px] text-[13px] whitespace-nowrap">
                  {languageLabel(lang)} voice
                  <Select
                    size={36}
                    value={voice}
                    disabled={!isOwner}
                    onChange={(e) =>
                      up({
                        voices: { ...d.voices, [lang]: e.target.value as BulbulV3Speaker },
                      })
                    }
                    className="text-ink w-auto"
                  >
                    {BULBUL_V3_SPEAKERS.map((s) => (
                      <option key={s} value={s}>
                        {VOICE_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void preview.toggle({
                      clinicId: clinic.id,
                      text,
                      language: lang,
                      speaker: voice,
                    })
                  }
                  aria-label={stopVisible ? "Stop preview" : "Preview"}
                  aria-busy={preview.status === "loading" || undefined}
                  className={cn(
                    "inline-flex h-[36px] cursor-pointer items-center gap-[8px] rounded-9 border-0 px-[12px] text-[13.5px] font-medium text-white",
                    stopVisible ? "bg-teal" : "bg-ink hover:bg-ink-hover",
                  )}
                >
                  {stopVisible ? (
                    <Square size={13} aria-hidden="true" />
                  ) : (
                    <Play size={13} aria-hidden="true" />
                  )}
                  Preview
                </button>
                {playing ? (
                  <span aria-hidden="true" className="flex h-[18px] items-center gap-[2px]">
                    {[0, 0.15, 0.3, 0.45, 0.6].map((delay) => (
                      <span
                        key={delay}
                        className="bg-teal h-[18px] w-[3px] rounded-[2px]"
                        style={{ animation: `mxBar .9s ease-in-out ${delay}s infinite` }}
                      />
                    ))}
                  </span>
                ) : null}
                {preview.error ? (
                  <span role="alert" className="text-rose text-[12.5px]">
                    {preview.error}
                  </span>
                ) : null}
              </div>
            </Card>

            <Card aria-labelledby="asst-knows" className={SECTION}>
              <h2 id="asst-knows" className={H2}>
                What it knows
              </h2>
              <Field
                label="Handoff phone number (optional)"
                hint="Calls the assistant cannot handle are passed to this number."
                error={errors.handoff}
                className="max-w-[360px]"
              >
                <Input
                  type="tel"
                  size={42}
                  mono
                  value={d.handoff}
                  disabled={!isOwner}
                  onChange={(e) => up({ handoff: e.target.value })}
                  className="text-[14px]"
                />
              </Field>
              <Field label="Knowledge" error={errors.knowledge}>
                <Textarea
                  size="lg"
                  rows={3}
                  value={d.knowledge}
                  disabled={!isOwner}
                  onChange={(e) => up({ knowledge: e.target.value })}
                />
              </Field>
              <div className="border-chip flex flex-col gap-[10px] border-t pt-[14px]">
                <div className="flex items-center justify-between">
                  <span id="asst-faq" className="text-ink-2 text-[13px] font-medium">
                    Common questions (optional)
                  </span>
                  <span className="text-muted-2 font-mono text-[11.5px]">
                    {d.faq.length}/{MAX_FAQ}
                  </span>
                </div>
                {d.faq.map((f, i) => (
                  <div
                    key={i}
                    role="group"
                    aria-label={`Question ${i + 1}`}
                    className="border-line bg-subtle grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[8px] rounded-12 border p-[12px] max-sm:grid-cols-1"
                  >
                    <div className="flex flex-col gap-[6px]">
                      <Input
                        size={38}
                        aria-label="Question"
                        placeholder="Question"
                        maxLength={200}
                        value={f.q}
                        disabled={!isOwner}
                        onChange={(e) =>
                          up({
                            faq: d.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)),
                          })
                        }
                        className="rounded-8 font-medium"
                      />
                      <Textarea
                        size="sm"
                        rows={2}
                        aria-label="Answer"
                        placeholder="Answer"
                        maxLength={1000}
                        value={f.a}
                        disabled={!isOwner}
                        onChange={(e) =>
                          up({
                            faq: d.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)),
                          })
                        }
                      />
                    </div>
                    {isOwner ? (
                      <Button
                        variant="danger-ghost"
                        size={30}
                        onClick={() => up({ faq: d.faq.filter((_, j) => j !== i) })}
                        aria-label={`Remove question ${i + 1}`}
                        className="max-sm:justify-self-end"
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
                {errors.faq ? (
                  <span role="alert" className="text-rose text-[12px]">
                    {errors.faq}
                  </span>
                ) : null}
                {isOwner && d.faq.length < MAX_FAQ ? (
                  <Button
                    variant="dashed"
                    size={34}
                    icon={Plus}
                    iconSize={13}
                    onClick={() => up({ faq: [...d.faq, { q: "", a: "" }] })}
                    className="self-start text-[13px]"
                  >
                    Add a question
                  </Button>
                ) : null}
              </div>
            </Card>

            <RecordCallsToggle
              clinicId={clinic.id}
              initial={clinicRecordCalls(clinic.settings)}
              isOwner={isOwner}
            />
          </div>

          <CallerPreview
            name={d.name}
            languageLabel={languageLabel(lang)}
            voiceLabel={VOICE_LABEL[voice]}
            greeting={text}
            playing={playing}
          />
        </div>
      </div>
      {/* Outside the animated root: its transform would pin a fixed child to the page, not the viewport. */}
      {dirty && isOwner ? (
        <UnsavedBar busy={busy} onDiscard={discard} onSave={() => void save()} />
      ) : null}
    </>
  );
}
