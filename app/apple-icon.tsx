import { ImageResponse } from "next/og";

// Apple touch icon (iOS "Add to Home Screen"). Same brand mark as app/icon.tsx; iOS rounds the corners.
export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 40%, #1d4537 0%, #0d1512 66%)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none" stroke="#79e6b2" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 21h8" />
          <path d="M12 17v4" />
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M17 5h3v1a4 4 0 0 1-4 4" />
          <path d="M7 5H4v1a4 4 0 0 0 4 4" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
