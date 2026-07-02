// Small "moved since the start of today" indicator (percentage points). Renders nothing when the change
// rounds to zero, so the UI stays clean between matchdays. Up reads as a lit green (--win); down is muted
// (--loss), not alarming red — red is reserved for live/error, not a probability drifting down. The caret is
// an inline SVG so its baseline is pixel-identical up vs down (Unicode ▲/▼ sit at different heights).
export function Delta({ v }: { v?: number }) {
  if (v == null) return null;
  const pp = Math.round(v * 100);
  if (pp === 0) return null;
  const up = pp > 0;
  const mag = Math.abs(pp);
  return (
    <span
      className={`ms-1 inline-flex items-center gap-0.5 whitespace-nowrap font-mono text-[10px] ${up ? "text-win" : "text-loss"}`}
      title={`${up ? "Up" : "Down"} ${mag} percentage point${mag === 1 ? "" : "s"} since the start of today`}
    >
      <svg viewBox="0 0 8 8" width="7" height="7" fill="currentColor" aria-hidden className={up ? "" : "rotate-180"}>
        <path d="M4 0 8 7H0z" />
      </svg>
      {mag}
    </span>
  );
}
