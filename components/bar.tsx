// A horizontal probability bar with a label.
export function Pct({ value, tone = "primary" }: { value: number; tone?: "primary" | "green" | "muted" }) {
  const pct = Math.round(value * 100);
  const color =
    tone === "green" ? "bg-emerald-500/80" : tone === "muted" ? "bg-muted-foreground/40" : "bg-primary/80";
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted/50 relative h-1.5 w-full overflow-hidden rounded-full">
        <div className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-foreground/80 w-9 shrink-0 text-right font-mono text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

export function fmtPct(value: number): string {
  if (value > 0 && value < 0.005) return "<1%";
  return `${Math.round(value * 100)}%`;
}
