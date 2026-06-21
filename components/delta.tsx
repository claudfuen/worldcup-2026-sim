// Small "moved since yesterday" indicator. Renders nothing when the change rounds to zero,
// so the UI stays clean between matchdays.
export function Delta({ v }: { v?: number }) {
  if (v == null) return null;
  const pp = Math.round(v * 100);
  if (pp === 0) return null;
  const up = pp > 0;
  return (
    <span
      className={`ml-1 font-mono text-[10px] ${up ? "text-emerald-400" : "text-red-400"}`}
      title="Change since the start of today (ET)"
    >
      {up ? "▲" : "▼"}{Math.abs(pp)}
    </span>
  );
}
