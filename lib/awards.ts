// Tournament awards — currently the Golden Boot (top scorer) and the assists race ("Playmaker"). Both are
// fully data-driven from the parsed match timelines, so unlike a voted award (Golden Ball / Golden Glove)
// they're deterministic. As well as the live standing, we forecast where each race FINISHES: a player's
// goals (or assists) are projected forward over the matches their team is still expected to play, and a
// seeded Monte Carlo turns that into a P(win the award) and a projected final tally.
import type { MatchInfo } from "./predictions";
import type { TeamProb } from "./sim/simulate";
import type { MatchSummary } from "./matchEvents";
import { mulberry32, samplePoisson } from "./sim/rng";

export interface AwardEntry {
  player: string;
  teamCode: string;
  value: number; // the award metric NOW: goals (Golden Boot) or assists (Playmaker)
  goals: number; // raw, for display on either board
  assists: number;
  penalties: number; // penalty goals (subset of goals) — shown so a pen-heavy tally is transparent
  matches: number; // team matches the tally was accrued over (the rate denominator)
  matchesLeft: number; // EXPECTED remaining matches the team plays (group + probability-weighted KO depth) —
  // the upside lever: a player on a deep-run team has more games left to add to their tally
  projected: number; // forecast FINAL value (mean), incl. goals still to come
  winProb: number; // P(finishes the tournament top of this race), incl. ties split
  eliminated: boolean; // mathematically out: team has no matches left AND already below the leader (frozen
  // tally that someone has already beaten). A definitive state, not a probability — there is no symmetric
  // "clinched", because an active player can always score more, so the lead can never be locked mid-tournament.
}

export interface Awards {
  goldenBoot: AwardEntry[]; // sorted: goals desc, then assists, then projected
  assists: AwardEntry[]; // sorted: assists desc, then goals, then projected
  matchesCounted: number; // completed/live matches the tallies were aggregated from (transparency)
}

// Forecast knobs. A player's future per-match rate is an empirical-Bayes estimate: their tally regressed
// toward an attacker prior with strength α (in pseudo-matches). Early-tournament rates are very noisy — a
// 5-in-2 hot start shouldn't extrapolate to a record-shattering total — so the prior is deliberately heavy
// and the rate is capped at a realistic elite ceiling (few players sustain ~1 goal/match over a tournament).
const PRIOR_GOAL_RATE = 0.4;
const PRIOR_ASSIST_RATE = 0.28;
const PRIOR_STRENGTH = 4;
const RATE_CAP = 0.9; // max sustained per-match rate the forecast will extrapolate
const MC_ITERS = 20_000;
const FORECAST_SEED = 20260611;

type Tally = { player: string; teamCode: string; goals: number; penalties: number; assists: number };

// Aggregate goals + assists per (player, team) from every completed/live match. Own goals are excluded (they
// don't credit the scorer); penalties count toward the Golden Boot and are tracked separately for display.
export async function aggregateScorers(
  matches: MatchInfo[],
  getSummary: (m: MatchInfo) => Promise<MatchSummary>,
): Promise<{ tallies: Tally[]; matchesCounted: number }> {
  const played = matches.filter((m) => (m.status === "final" || m.status === "live") && m.home && m.away);
  const summaries = await Promise.all(played.map((m) => getSummary(m).catch(() => ({ events: [], stats: null }) as MatchSummary)));
  const byKey = new Map<string, Tally>();
  const get = (player: string, teamCode: string) => {
    const key = `${player}|${teamCode}`;
    let t = byKey.get(key);
    if (!t) { t = { player, teamCode, goals: 0, penalties: 0, assists: 0 }; byKey.set(key, t); }
    return t;
  };
  for (const s of summaries) {
    for (const e of s.events) {
      if (e.kind !== "goal" || !e.teamCode || !e.player) continue;
      if (e.goalType === "own") continue; // own goals don't credit the scorer toward the Golden Boot
      const t = get(e.player, e.teamCode);
      t.goals++;
      if (e.goalType === "penalty") t.penalties++;
      if (e.assist) get(e.assist, e.teamCode).assists++;
    }
  }
  return { tallies: [...byKey.values()], matchesCounted: played.length };
}

// Per-team match accounting: how many matches each team has already played (the rate denominator) and how
// many group matches remain (knockout depth comes from the sim probabilities instead).
function teamMatchCounts(matches: MatchInfo[]): { played: Map<string, number>; groupRemaining: Map<string, number> } {
  const played = new Map<string, number>();
  const groupPlayed = new Map<string, number>();
  const bump = (m: Map<string, number>, c?: string | null) => c && m.set(c, (m.get(c) ?? 0) + 1);
  for (const m of matches) {
    const counts = m.status === "final" || m.status === "live";
    if (!counts || !m.home || !m.away) continue;
    bump(played, m.home);
    bump(played, m.away);
    if (m.round === "GROUP") { bump(groupPlayed, m.home); bump(groupPlayed, m.away); }
  }
  const groupRemaining = new Map<string, number>();
  // Every team plays 3 group matches; whatever isn't played/in-progress yet still lies ahead.
  for (const c of played.keys()) groupRemaining.set(c, Math.max(0, 3 - (groupPlayed.get(c) ?? 0)));
  return { played, groupRemaining };
}

// The distribution of how many KNOCKOUT matches a team still plays, derived from the sim's round-reach
// marginals. A team plays a match in every round it reaches; everyone who reaches the semifinal then plays
// a 5th match (final OR third-place playoff), so the only reachable counts are {0,1,2,3,5}.
function koDepthDist(t: TeamProb): { k: number; p: number }[] {
  const adv = t.advance, r16 = t.r16, qf = t.qf, sf = t.sf;
  const dist = [
    { k: 0, p: 1 - adv },
    { k: 1, p: adv - r16 },
    { k: 2, p: r16 - qf },
    { k: 3, p: qf - sf },
    { k: 5, p: sf },
  ].map((d) => ({ k: d.k, p: Math.max(0, d.p) }));
  const total = dist.reduce((s, d) => s + d.p, 0) || 1;
  return dist.map((d) => ({ k: d.k, p: d.p / total }));
}

function expectedKoMatches(t: TeamProb): number {
  return t.advance + t.r16 + t.qf + 2 * t.sf;
}

type Cand = {
  player: string;
  teamCode: string;
  value: number; // goals or assists
  rate: number; // shrunk per-match rate
  groupRemaining: number;
  depth: { k: number; p: number }[];
  expRemaining: number;
};

// Run the seeded Monte Carlo over one race (Golden Boot or assists). Each iteration draws every candidate's
// remaining team matches (group + a sampled KO depth) and their goals/assists in those matches (Poisson at
// the shrunk rate), then credits the win to the final leader (ties split). Returns winProb per candidate.
function simulateRace(cands: Cand[], rand: () => number): Map<number, number> {
  const wins = new Array(cands.length).fill(0);
  for (let it = 0; it < MC_ITERS; it++) {
    let best = -1, bestIdx: number[] = [];
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      // sample KO depth
      const r = rand();
      let cum = 0, k = 0;
      for (const d of c.depth) { cum += d.p; if (r <= cum) { k = d.k; break; } }
      const remaining = c.groupRemaining + k;
      const extra = remaining > 0 ? samplePoisson(c.rate * remaining, rand) : 0;
      const final = c.value + extra;
      if (final > best) { best = final; bestIdx = [i]; }
      else if (final === best) bestIdx.push(i);
    }
    if (best > 0) { const share = 1 / bestIdx.length; for (const i of bestIdx) wins[i] += share; }
  }
  const out = new Map<number, number>();
  cands.forEach((_, i) => out.set(i, wins[i] / MC_ITERS));
  return out;
}

function buildBoard(
  tallies: Tally[],
  valueOf: (t: Tally) => number,
  priorRate: number,
  teams: Record<string, TeamProb>,
  played: Map<string, number>,
  groupRemaining: Map<string, number>,
  rand: () => number,
): AwardEntry[] {
  const cands: Cand[] = tallies
    .filter((t) => valueOf(t) > 0)
    .map((t) => {
      const tp = teams[t.teamCode];
      const matches = played.get(t.teamCode) ?? 0;
      const rate = Math.min(RATE_CAP, (valueOf(t) + PRIOR_STRENGTH * priorRate) / (matches + PRIOR_STRENGTH));
      const gr = groupRemaining.get(t.teamCode) ?? 0;
      const depth = tp ? koDepthDist(tp) : [{ k: 0, p: 1 }];
      const expRemaining = gr + (tp ? expectedKoMatches(tp) : 0);
      return { player: t.player, teamCode: t.teamCode, value: valueOf(t), rate, groupRemaining: gr, depth, expRemaining };
    });
  const winProbs = simulateRace(cands, rand);
  // The current race leader: anyone frozen (no matches left) and strictly below this can never catch up.
  const leaderValue = cands.reduce((m, c) => Math.max(m, c.value), 0);
  const FROZEN = 0.01; // expected remaining matches ≈ 0 → the team has no game left to add to the tally
  return cands
    .map((c, i) => {
      const t = tallies.find((x) => x.player === c.player && x.teamCode === c.teamCode)!;
      return {
        player: c.player,
        teamCode: c.teamCode,
        value: c.value,
        goals: t.goals,
        assists: t.assists,
        penalties: t.penalties,
        matches: played.get(c.teamCode) ?? 0,
        matchesLeft: c.expRemaining,
        projected: c.value + c.rate * c.expRemaining,
        winProb: winProbs.get(i) ?? 0,
        eliminated: c.expRemaining < FROZEN && c.value < leaderValue,
      };
    })
    .sort((a, b) => b.value - a.value || b.projected - a.projected || b.winProb - a.winProb);
}

export async function computeAwards(
  matches: MatchInfo[],
  teams: Record<string, TeamProb>,
  getSummary: (m: MatchInfo) => Promise<MatchSummary>,
  seed = FORECAST_SEED,
): Promise<Awards> {
  const { tallies, matchesCounted } = await aggregateScorers(matches, getSummary);
  const { played, groupRemaining } = teamMatchCounts(matches);
  const rand = mulberry32(seed);
  const goldenBoot = buildBoard(tallies, (t) => t.goals, PRIOR_GOAL_RATE, teams, played, groupRemaining, rand);
  const assists = buildBoard(tallies, (t) => t.assists, PRIOR_ASSIST_RATE, teams, played, groupRemaining, rand);
  return { goldenBoot, assists, matchesCounted };
}
