// Small "moved since the start of today" indicator (percentage points). Renders nothing when the
// change rounds to zero, so the UI stays clean between matchdays.
export function Delta({ v }: { v?: number }) {
  if (v == null) return null;
  const pp = Math.round(v * 100);
  if (pp === 0) return null;
  const up = pp > 0;
  const mag = Math.abs(pp);
  return (
    <span
      className={`ms-1 inline-flex items-center gap-px whitespace-nowrap font-mono text-[10px] ${up ? "text-win" : "text-destructive"}`}
      title={`${up ? "Up" : "Down"} ${mag} percentage point${mag === 1 ? "" : "s"} since the start of today`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {mag}
    </span>
  );
}
