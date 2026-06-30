import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import type { MatchInfo, TeamPrediction } from "@/lib/predictions";
import { hasReachedRound, isEliminated } from "@/lib/teamStatus";
import { getT } from "@/lib/i18n/server";

// Side-by-side "how far does each team go" comparison for a defined match: the Monte Carlo probability that
// each side reaches each remaining stage. Gives a match page tournament context (and relative strength) on
// its own, without the visitor needing the bracket. Columns start at the round AFTER this match's stage.
type RoundKey = "advance" | "r16" | "qf" | "sf" | "final" | "title";
type Rounds = Record<RoundKey, number>;
// Each ladder column carries its rounds.* short label key, translated at render time.
const LADDER: [RoundKey, string][] = [
  ["advance", "rounds.shortR32"], ["r16", "rounds.shortR16"], ["qf", "rounds.shortQF"], ["sf", "rounds.shortSF"], ["final", "rounds.shortFinal"], ["title", "rounds.shortChamp"],
];
// Index into LADDER to start at for each round (a match at stage X shows odds for the stages it leads to).
const START: Record<string, number> = { GROUP: 0, R32: 1, R16: 2, QF: 3, SF: 4, FINAL: 6, "3P": 6 };
const heat = (v: number) => `color-mix(in oklab, var(--primary) ${Math.round(Math.min(v, 1) * 22)}%, transparent)`;

export async function MatchOutlook({ round, home, away, matches }: { round: string; home: TeamPrediction; away: TeamPrediction; matches: MatchInfo[] }) {
  const t = await getT();
  const cols = LADDER.slice(START[round] ?? 0);
  if (cols.length === 0) return null; // Final / third-place play-off: no meaningful onward ladder

  const row = (tm: TeamPrediction) => {
    const r = tm as unknown as Rounds;
    const out = isEliminated(matches, tm.code, r.advance ?? 0);
    return (
    <div className="contents">
      <div className="bg-card flex items-center gap-2 px-3 py-2.5">
        <Flag code={tm.code} size={18} />
        <span className={`truncate text-[13px] font-medium ${out ? "text-muted-foreground line-through" : ""}`}>{tm.name}</span>
      </div>
      {out ? (
        // One readable band across the onward-ladder columns (a single state, not per-column data). Spanning
        // keeps "Eliminated" legible — the narrow ~40px data columns can't hold the word on their own.
        <div className="bg-card text-muted-2 flex items-center px-3 py-2.5 text-xs" style={{ gridColumn: `span ${cols.length}` }}>{t("common.eliminated")}</div>
      ) : (
        cols.map(([k]) => {
          // ✓ when mathematically through to this round (a fact), else the Monte Carlo forecast.
          const clinched = hasReachedRound(matches, tm.code, k);
          return (
            <div
              key={k}
              className={`bg-card flex items-center justify-center py-2.5 font-mono text-[11px] font-bold tabular-nums sm:text-xs ${clinched ? "text-win" : k === "title" ? "text-primary" : ""}`}
              style={{ backgroundColor: heat(clinched ? 1 : r[k]) }}
            >
              {clinched ? <span aria-hidden>✓</span> : forecastPct(r[k])}
            </div>
          );
        })
      )}
    </div>
  );
  };

  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.tournamentOutlook")}</h2>
      <div className="border-border overflow-x-auto rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        <div className="grid min-w-[340px] gap-px sm:min-w-[420px]" style={{ gridTemplateColumns: `minmax(92px,1.3fr) repeat(${cols.length}, 1fr)` }}>
          <div className="bg-card px-3 py-2" />
          {cols.map(([k, label]) => (
            <div key={k} className={`bg-card text-muted-2 flex items-center justify-center py-2 text-[10px] font-semibold tracking-wide uppercase ${k === "title" ? "text-primary" : ""}`}>{t(label)}</div>
          ))}
          {row(home)}
          {row(away)}
        </div>
      </div>
      <p className="text-muted-2 mt-2 text-xs">{t("match.outlookNote")}</p>
    </section>
  );
}
