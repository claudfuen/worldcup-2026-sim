// "How the model did" — scoring our own forecasts against reality. This is what keeps a PREDICTION tool
// worth visiting once results are known: not live odds, but a credibility audit. All of it is computed from
// data already in the payload (every final match keeps its honest pre-match W/D/L via fillMatchForecast) plus
// a one-off reconstruction of the pre-tournament forecast (the sim on base ratings, no results — cached).
import { cache } from "react";
import { buildGroupMatches, liveRatings } from "./espn";
import { runMonteCarlo } from "./sim/simulate";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED } from "./kv";
import type { MatchInfo } from "./predictions";

type Outcome = "home" | "draw" | "away";

export interface CalibrationBin {
  label: string; // e.g. "60–70%"
  predicted: number; // mean confidence in the top pick, for matches in this bin
  actual: number; // share of those matches the top pick actually won
  n: number;
}

export interface MatchAccuracy {
  n: number; // completed matches scored
  brier: number; // multi-class Brier of the pre-match W/D/L vs the regulation result (lower = better)
  brierBaseline: number; // Brier of a "climatology" predictor (always the base-rate outcome) — the skill bar
  skill: number; // 1 − brier/baseline (>0 means the model beats just knowing the averages)
  favouriteAccuracy: number; // share of matches where the model's most-likely outcome happened
  favouriteN: number; // matches counted for favouriteAccuracy (= n)
  calibration: CalibrationBin[];
}

export interface TournamentAccuracy {
  championCode?: string; // the actual champion (once decided)
  championRank?: number; // where the model ranked them pre-tournament by title odds (1 = called the winner)
  championProb?: number; // the model's pre-tournament title probability for the actual champion
  advanceCalled?: number; // of the 32 that reached the R32, how many were in the model's pre-tournament top 32
  advanceTotal?: number; // 32 once the group stage is complete
}

function outcomeOf(m: MatchInfo): Outcome | null {
  if (m.homeScore == null || m.awayScore == null) return null;
  return m.homeScore > m.awayScore ? "home" : m.homeScore < m.awayScore ? "away" : "draw";
}

// Regulation W/D/L accuracy from every completed match. Brier scored against the score-line result (a KO
// match level after 90 counts as a draw — which is exactly what the regulation W/D/L predicted).
export function computeMatchAccuracy(matches: MatchInfo[]): MatchAccuracy | null {
  const scored = matches.filter((m) => m.status === "final" && m.probs && m.home && m.away && outcomeOf(m));
  const n = scored.length;
  if (n === 0) return null;

  const rows = scored.map((m) => {
    const o = outcomeOf(m)!;
    const p = m.probs!;
    const probOf = { home: p.home, draw: p.draw, away: p.away };
    const pick = (["home", "draw", "away"] as Outcome[]).reduce((a, b) => (probOf[b] > probOf[a] ? b : a), "home");
    return { o, probOf, pick, topProb: probOf[pick] };
  });

  // Base-rate ("climatology") reference: predict the overall outcome frequencies for every match.
  const rate: Record<Outcome, number> = { home: 0, draw: 0, away: 0 };
  for (const r of rows) rate[r.o]++;
  (Object.keys(rate) as Outcome[]).forEach((k) => (rate[k] /= n));

  const brierOne = (probOf: Record<Outcome, number>, o: Outcome) =>
    (["home", "draw", "away"] as Outcome[]).reduce((s, k) => s + (probOf[k] - (k === o ? 1 : 0)) ** 2, 0);

  const brier = rows.reduce((s, r) => s + brierOne(r.probOf, r.o), 0) / n;
  const brierBaseline = rows.reduce((s, r) => s + brierOne(rate, r.o), 0) / n;
  const favouriteHits = rows.filter((r) => r.pick === r.o).length;

  // Calibration of the model's confidence in its top pick, in 10-pt buckets.
  const edges = [0.4, 0.5, 0.6, 0.7, 0.8, 1.0001];
  const calibration: CalibrationBin[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i], hi = edges[i + 1];
    const inBin = rows.filter((r) => r.topProb >= lo && r.topProb < hi);
    if (inBin.length === 0) continue;
    calibration.push({
      label: `${Math.round(lo * 100)}–${Math.round(Math.min(hi, 1) * 100)}%`,
      predicted: inBin.reduce((s, r) => s + r.topProb, 0) / inBin.length,
      actual: inBin.filter((r) => r.pick === r.o).length / inBin.length,
      n: inBin.length,
    });
  }

  return {
    n,
    brier,
    brierBaseline,
    skill: brierBaseline > 0 ? 1 - brier / brierBaseline : 0,
    favouriteAccuracy: favouriteHits / n,
    favouriteN: n,
    calibration,
  };
}

// The model's ORIGINAL pre-tournament forecast — the sim on base ratings with no results — reconstructed once
// and cached (it never changes). Used to score the champion call + advance hit-rate honestly.
export const preTournamentForecast = cache(async (): Promise<Record<string, { advance: number; title: number }>> => {
  const KEY = "scorecard:pretournament:v1";
  if (KV_CONFIGURED) {
    try {
      const c = await kvGetJSON<Record<string, { advance: number; title: number }>>(KEY);
      if (c) return c;
    } catch {
      /* recompute */
    }
  }
  const groupMatches = buildGroupMatches([], []);
  const ratings = liveRatings([]); // no completed matches replayed → pre-tournament Elo
  const sim = runMonteCarlo(groupMatches, ratings, 20000, 20260611);
  const out: Record<string, { advance: number; title: number }> = {};
  for (const t of Object.values(sim.teams)) out[t.code] = { advance: t.advance, title: t.title };
  if (KV_CONFIGURED) await kvSetJSON(KEY, out).catch(() => {});
  return out;
});

export function computeTournamentAccuracy(
  matches: MatchInfo[],
  champion: string | undefined,
  pre: Record<string, { advance: number; title: number }>,
): TournamentAccuracy {
  const out: TournamentAccuracy = {};
  // Actual R32 qualifiers = the participants of the Round-of-32 matches (resolved once the group stage ends).
  const advancers = new Set<string>();
  for (const m of matches) {
    if (m.round !== "R32") continue;
    if (m.home) advancers.add(m.home);
    if (m.away) advancers.add(m.away);
  }
  if (advancers.size === 32) {
    const top32 = new Set(
      Object.entries(pre)
        .sort((a, b) => b[1].advance - a[1].advance)
        .slice(0, 32)
        .map(([c]) => c),
    );
    out.advanceCalled = [...advancers].filter((c) => top32.has(c)).length;
    out.advanceTotal = 32;
  }
  if (champion) {
    const ranked = Object.entries(pre).sort((a, b) => b[1].title - a[1].title).map(([c]) => c);
    out.championCode = champion;
    out.championRank = ranked.indexOf(champion) + 1 || undefined;
    out.championProb = pre[champion]?.title;
  }
  return out;
}
