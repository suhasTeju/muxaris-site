import { ImageResponse } from "next/og";

export const alt = "Muxaris: an AI voice receptionist for Indian clinics";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "#fafaf7",
        color: "#0c1220",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 600 }}>
        muxarıs
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 14,
            background: "#16a34a",
            marginLeft: 6,
            marginTop: -22,
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 76, lineHeight: 1.04, letterSpacing: -2 }}>
          Your front desk misses calls.
        </div>
        <div style={{ fontSize: 76, lineHeight: 1.04, letterSpacing: -2, color: "#128a3f" }}>
          Muxaris doesn’t.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 28, color: "#5b6472" }}>
        English · Hindi · Kannada · Tamil · Telugu
      </div>
    </div>,
    size,
  );
}
