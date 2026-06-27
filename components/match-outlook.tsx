import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import type { TeamPrediction } from "@/lib/predictions";

// Side-by-side "how far does each team go" comparison for a defined match: the Monte Carlo probability that
// each side reaches each remaining stage. Gives a match page tournament context (and relative strength) on
// its own, without the visitor needing the bracket. Columns start at the round AFTER this match's stage.
type RoundKey = "advance" | "r16" | "qf" | "sf" | "final" | "title";
type Rounds = Record<RoundKey, number>;
const LADDER: [RoundKey, string][] = [
  ["advance", "R32"], ["r16", "R16"], ["qf", "QF"], ["sf", "SF"], ["final", "Final"], ["title", "Champ"],
];
// Index into LADDER to start at for each round (a match at stage X shows odds for the stages it leads to).
const START: Record<string, number> = { GROUP: 0, R32: 1, R16: 2, QF: 3, SF: 4, FINAL: 6, "3P": 6 };
const heat = (v: number) => `color-mix(in oklab, var(--primary) ${Math.round(Math.min(v, 1) * 22)}%, transparent)`;

export function MatchOutlook({ round, home, away }: { round: string; home: TeamPrediction; away: TeamPrediction }) {
  const cols = LADDER.slice(START[round] ?? 0);
  if (cols.length === 0) return null; // Final / third-place play-off: no meaningful onward ladder

  const row = (t: TeamPrediction) => {
    const r = t as unknown as Rounds;
    const out = (r.advance ?? 0) === 0; // can't even reach the R32 → eliminated; show "Eliminated", not a row of 0%
    return (
    <div className="contents">
      <div className="bg-card flex items-center gap-2 px-3 py-2.5">
        <Flag code={t.code} size={18} />
        <span className={`truncate text-[13px] font-medium ${out ? "text-muted-foreground line-through" : ""}`}>{t.name}</span>
      </div>
      {out ? (
        <div className="bg-card text-muted-2 flex items-center px-3 py-2.5 text-xs" style={{ gridColumn: `span ${cols.length}` }}>Eliminated</div>
      ) : (
        cols.map(([k]) => (
          <div
            key={k}
            className={`bg-card flex items-center justify-center py-2.5 font-mono text-xs font-bold tabular-nums ${k === "title" ? "text-primary" : ""}`}
            style={{ backgroundColor: heat(r[k]) }}
          >
            {forecastPct(r[k])}
          </div>
        ))
      )}
    </div>
  );
  };

  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">Tournament outlook</h2>
      <div className="border-border overflow-x-auto rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        <div className="grid min-w-[420px] gap-px" style={{ gridTemplateColumns: `minmax(120px,1.4fr) repeat(${cols.length}, 1fr)` }}>
          <div className="bg-card px-3 py-2" />
          {cols.map(([k, label]) => (
            <div key={k} className={`bg-card text-muted-2 flex items-center justify-center py-2 text-[10px] font-semibold tracking-wide uppercase ${k === "title" ? "text-primary" : ""}`}>{label}</div>
          ))}
          {row(home)}
          {row(away)}
        </div>
      </div>
      <p className="text-muted-2 mt-2 text-xs">Model probability each side reaches each stage. A % is a forecast, capped at 99%.</p>
    </section>
  );
}
