import { ImageResponse } from "next/og";
import { HERO } from "@/lib/content";

export const alt = "Muxaris: an AI voice receptionist for Indian clinics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "Your front desk misses calls.";
const ACCENT = "Muxaris doesn’t.";
const LANGS = "Kannada · Hindi · Tamil · Telugu · English";
const WORDMARK = "muxarıs";

type Font = { name: string; data: ArrayBuffer; weight: 500 | 600; style: "normal" };

/**
 * The design's faces, subset to the text drawn, as TrueType from Google Fonts (the image renderer
 * cannot read woff2). Build time only; on any failure the image falls back to the bundled sans.
 */
async function googleFont(family: string, weight: 500 | 600, text: string): Promise<Font | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return { name: family, data: await res.arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const fonts = (
    await Promise.all([
      googleFont("Schibsted Grotesk", 600, `${HEADLINE} ${ACCENT}`),
      googleFont("Schibsted Grotesk", 500, LANGS),
      googleFont("Geist Mono", 500, HERO.eyebrow.toUpperCase()),
      googleFont("Fraunces", 600, WORDMARK),
    ])
  ).filter((f): f is Font => f !== null);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 68px",
        backgroundColor: "#f4f6f9",
        backgroundImage:
          "radial-gradient(42% 60% at 86% 14%, rgba(14,154,150,0.20), transparent 70%), radial-gradient(40% 50% at 4% 96%, rgba(94,224,214,0.18), transparent 70%)",
        color: "#0c1220",
        fontFamily: "Schibsted Grotesk",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Fraunces",
            fontSize: 52,
            fontWeight: 600,
            letterSpacing: -1.3,
            lineHeight: 1,
          }}
        >
          {WORDMARK}
        </div>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 10,
            background: "#16a34a",
            marginLeft: -37,
            marginTop: 4,
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            alignSelf: "flex-start",
            gap: 12,
            padding: "8px 16px 8px 12px",
            border: "1px solid #e2e7ee",
            borderRadius: 999,
            background: "rgba(255,255,255,0.7)",
            color: "#0b6b70",
            fontFamily: "Geist Mono",
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: 1.4,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 10, background: "#16a34a" }} />
          {HERO.eyebrow.toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 84,
            fontWeight: 600,
            lineHeight: 0.98,
            letterSpacing: -4,
          }}
        >
          <div style={{ display: "flex" }}>{HEADLINE}</div>
          <div style={{ display: "flex", color: "#0e9a96" }}>{ACCENT}</div>
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: "#5f6b7c" }}>
        {LANGS}
      </div>
    </div>,
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
