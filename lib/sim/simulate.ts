// Monte Carlo: simulate all remaining matches many times; aggregate group + knockout probabilities.
import type { GroupMatch, Ratings } from "./types";
import { rankGroup } from "./standings";
import { selectAndAssignThirds, type ThirdTeam } from "./thirdPlace";
import { buildR32, simulateKnockout, type GroupOutcome, type KOLive } from "./knockout";
import { sampleScoreline, sampleRemainingScoreline } from "./poisson";
import { mulberry32, gaussian } from "./rng";
import { hostEloBoost } from "./hosts";
import { GROUPS } from "../data/teams";

// Per-iteration rating uncertainty (Elo treated as an estimate, not exact) — fattens tails / curbs over-concentration.
const RATING_SIGMA = 65;

export interface TeamProb {
  code: string;
  group: string;
  winGroup: number;
  runnerUp: number;
  third: number;
  advance: number; // reach R32 (top 2 or selected best-third)
  r16: number;
  qf: number;
  sf: number;
  final: number;
  title: number;
}

export interface SimResult {
  iterations: number;
  teams: Record<string, TeamProb>;
  // per team: distribution of Round-of-32 opponents (probability)
  r32Opponents: Record<string, Record<string, number>>;
  // per knockout match number: probability each team fills the home/away slot
  matchProjection: Record<number, { home: Record<string, number>; away: Record<string, number> }>;
  // per knockout match number: probability of each exact matchup, keyed "home|away"
  matchPairs: Record<number, Record<string, number>>;
}

// Round-robin fixtures (6 per group) from a list of 4 team codes.
export function roundRobin(group: string, codes: string[]): GroupMatch[] {
  const ms: GroupMatch[] = [];
  for (let i = 0; i < codes.length; i++)
    for (let j = i + 1; j < codes.length; j++) ms.push({ group, home: codes[i], away: codes[j], played: false });
  return ms;
}

export function runMonteCarlo(
  groupMatches: Record<string, GroupMatch[]>,
  ratings: Ratings,
  iterations: number,
  seed = 12345,
  koWinners: Record<number, string> = {}, // actual knockout results: each iteration fixes these matches to their real winner
  koLive: KOLive = {}, // in-progress knockout matches: advancement conditioned on the live score
): SimResult {
  const rand = mulberry32(seed);
  const teams: Record<string, TeamProb> = {};
  const r32Opp: Record<string, Record<string, number>> = {};
  const matchAgg: Record<number, { home: Record<string, number>; away: Record<string, number> }> = {};
  const pairAgg: Record<number, Record<string, number>> = {};
  for (const g of GROUPS)
    for (const m of groupMatches[g]) for (const c of [m.home, m.away]) {
      if (!teams[c]) {
        teams[c] = { code: c, group: g, winGroup: 0, runnerUp: 0, third: 0, advance: 0, r16: 0, qf: 0, sf: 0, final: 0, title: 0 };
        r32Opp[c] = {};
      }
    }

  for (let it = 0; it < iterations; it++) {
    // This run's perturbed strengths (rating uncertainty). Real ratings stay the FIFA-ranking tiebreak proxy.
    const pr: Record<string, number> = {};
    for (const c in teams) pr[c] = (ratings[c] ?? 1500) + gaussian(rand) * RATING_SIGMA;

    const groupOutcome: GroupOutcome = {};
    const thirds: ThirdTeam[] = [];
    for (const g of GROUPS) {
      // realize this group's matches: played -> actual; in-progress -> current score + sampled remainder;
      // not started -> full sampled scoreline (all with host advantage).
      const realized = groupMatches[g].map((m) => {
        if (m.played) return m;
        const diff = pr[m.home] - pr[m.away] + hostEloBoost(m.home, m.venue ?? "") - hostEloBoost(m.away, m.venue ?? "");
        const [hg, ag] = m.live
          ? sampleRemainingScoreline(diff, m.live.homeGoals, m.live.awayGoals, m.live.frac, rand)
          : sampleScoreline(diff, rand);
        return { ...m, played: true, homeGoals: hg, awayGoals: ag };
      });
      const codes = groupMatches[g].reduce<string[]>((acc, m) => {
        if (!acc.includes(m.home)) acc.push(m.home);
        if (!acc.includes(m.away)) acc.push(m.away);
        return acc;
      }, []);
      const ranked = rankGroup(codes, realized, ratings);
      const order = ranked.map((r) => r.code);
      groupOutcome[g] = order;
      teams[order[0]].winGroup++;
      teams[order[1]].runnerUp++;
      teams[order[2]].third++;
      teams[order[0]].advance++;
      teams[order[1]].advance++;
      thirds.push({ group: g, row: ranked[2] });
    }

    const { advancingByGroup, slotToTeam } = selectAndAssignThirds(thirds, ratings);
    for (const code of Object.values(advancingByGroup)) teams[code].advance++;

    const r32 = buildR32(groupOutcome, slotToTeam);
    for (const [, [h, a]] of Object.entries(r32)) {
      r32Opp[h][a] = (r32Opp[h][a] ?? 0) + 1;
      r32Opp[a][h] = (r32Opp[a][h] ?? 0) + 1;
    }

    const ko = simulateKnockout(r32, pr, rand, koWinners, koLive);
    for (const [mn, [h, a]] of Object.entries(ko.lineups)) {
      const m = Number(mn);
      if (!matchAgg[m]) matchAgg[m] = { home: {}, away: {} };
      matchAgg[m].home[h] = (matchAgg[m].home[h] ?? 0) + 1;
      matchAgg[m].away[a] = (matchAgg[m].away[a] ?? 0) + 1;
      if (!pairAgg[m]) pairAgg[m] = {};
      const key = `${h}|${a}`;
      pairAgg[m][key] = (pairAgg[m][key] ?? 0) + 1;
    }
    for (const c of ko.reached.R16) teams[c].r16++;
    for (const c of ko.reached.QF) teams[c].qf++;
    for (const c of ko.reached.SF) teams[c].sf++;
    for (const c of ko.reached.F) teams[c].final++;
    teams[ko.champion].title++;
  }

  // normalize
  const N = iterations;
  for (const c in teams) {
    const t = teams[c];
    t.winGroup /= N; t.runnerUp /= N; t.third /= N; t.advance /= N;
    t.r16 /= N; t.qf /= N; t.sf /= N; t.final /= N; t.title /= N;
  }
  const r32Opponents: Record<string, Record<string, number>> = {};
  for (const c in r32Opp) {
    r32Opponents[c] = {};
    for (const opp in r32Opp[c]) r32Opponents[c][opp] = r32Opp[c][opp] / N;
  }
  const matchProjection: Record<number, { home: Record<string, number>; away: Record<string, number> }> = {};
  for (const mn in matchAgg) {
    const m = Number(mn);
    matchProjection[m] = { home: {}, away: {} };
    for (const c in matchAgg[m].home) matchProjection[m].home[c] = matchAgg[m].home[c] / N;
    for (const c in matchAgg[m].away) matchProjection[m].away[c] = matchAgg[m].away[c] / N;
  }
  const matchPairs: Record<number, Record<string, number>> = {};
  for (const mn in pairAgg) {
    const m = Number(mn);
    matchPairs[m] = {};
    for (const k in pairAgg[m]) matchPairs[m][k] = pairAgg[m][k] / N;
  }
  return { iterations: N, teams, r32Opponents, matchProjection, matchPairs };
}
