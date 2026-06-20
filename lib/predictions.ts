// End-to-end: pull live results -> live ratings -> Monte Carlo -> assemble the payload stored in KV / rendered.
import { fetchResults, liveRatings, buildGroupMatches, type FetchedMatch } from "./espn";
import { runMonteCarlo } from "./sim/simulate";
import { rankGroup } from "./sim/standings";
import { computeClinch, minThirdPlacePoints, maxThirdPlacePoints, maxReachablePoints } from "./sim/clinch";
import { wdlProbs } from "./sim/poisson";
import { TEAMS, TEAM_BY_CODE, GROUPS } from "./data/teams";
import { SCHEDULE } from "./data/schedule";
import { MY_MATCHES } from "./data/tickets";
import type { TeamProb } from "./sim/simulate";

export interface TeamPrediction extends TeamProb {
  name: string;
  rating: number;
}
export interface GroupTeamView {
  code: string; name: string; played: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number; winGroup: number; advance: number;
  // certainty flips from probability to a definitive state once locked
  status: "won_group" | "advanced" | "eliminated" | "live";
}
export interface GroupView {
  group: string;
  teams: GroupTeamView[];
  decided: boolean; // all 6 matches played
}
export interface OpponentProb { code: string; name: string; prob: number }
export interface SlotCandidate { code: string; name: string; prob: number }

export interface MatchInfo {
  match: number;
  round: string;
  group?: string;
  utc: string;
  venue: string;
  city: string;
  // resolved/known participants (codes) where defined, else null
  home: string | null;
  away: string | null;
  homeName: string | null;
  awayName: string | null;
  slotHome?: string;
  slotAway?: string;
  // projected candidates for undefined slots
  projHome?: SlotCandidate[];
  projAway?: SlotCandidate[];
  defined: boolean; // both participants known
  // live result
  status: "scheduled" | "final";
  homeScore?: number;
  awayScore?: number;
  // forecast for DEFINED matches only
  favorite?: { code: string; name: string; winProb: number };
  probs?: { home: number; draw: number; away: number };
}

export interface MyMatch extends MatchInfo {
  tickets: number;
  ticketVenue?: string;
  note?: string;
}

export interface PredictionsPayload {
  updatedAt: string;
  iterations: number;
  matchesPlayed: number;
  totalGroupMatches: number;
  teams: TeamPrediction[];
  groups: GroupView[];
  r32Opponents: Record<string, OpponentProb[]>;
  matches: MatchInfo[];
  myMatches: MyMatch[];
}

function topCandidates(dist: Record<string, number> | undefined, n = 4): SlotCandidate[] {
  if (!dist) return [];
  return Object.entries(dist)
    .map(([code, prob]) => ({ code, name: TEAM_BY_CODE[code]?.name ?? code, prob }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, n);
}

export async function computePredictions(iterations = 20000, seed = 20260611): Promise<PredictionsPayload> {
  const results = await fetchResults();
  const ratings = liveRatings(results);
  const groupMatches = buildGroupMatches(results);
  const sim = runMonteCarlo(groupMatches, ratings, iterations, seed);

  const teams: TeamPrediction[] = Object.values(sim.teams)
    .map((t) => ({ ...t, name: TEAM_BY_CODE[t.code].name, rating: Math.round(ratings[t.code] ?? TEAM_BY_CODE[t.code].rating) }))
    .sort((a, b) => b.title - a.title);

  // Worst/best-case 3rd-place points per group — sound bounds for cross-group best-third certainty.
  const minThirdByGroup: Record<string, number> = {};
  const maxThirdByGroup: Record<string, number> = {};
  for (const g of GROUPS) {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    minThirdByGroup[g] = minThirdPlacePoints(codes, groupMatches[g]);
    maxThirdByGroup[g] = maxThirdPlacePoints(codes, groupMatches[g]);
  }

  const groups: GroupView[] = GROUPS.map((g) => {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    const rows = rankGroup(codes, groupMatches[g], ratings);
    const decided = groupMatches[g].every((m) => m.played);
    const clinch = computeClinch(codes, groupMatches[g], ratings); // mathematical certainty, not sim probability
    return {
      group: g,
      decided,
      teams: rows.map((r) => {
        const p = sim.teams[r.code];
        const cl = clinch[r.code];
        // Mathematically eliminated: out of top-2 AND best-3rd path is impossible
        // (>=8 other groups guarantee a 3rd-placed team with more points than this team can reach).
        let eliminated = false;
        if (cl.eliminatedTop2) {
          const maxThird = maxReachablePoints(r.code, groupMatches[g]);
          const betterGroups = GROUPS.filter((og) => og !== g && minThirdByGroup[og] > maxThird).length;
          eliminated = betterGroups >= 8;
        }
        // Clinched via best-third: guaranteed top-3 AND <=7 other groups could field a better third.
        const advancedByThird =
          !cl.top2 && cl.guaranteedTop3 &&
          GROUPS.filter((og) => og !== g && maxThirdByGroup[og] >= r.pts).length <= 7;
        // Definitive states come from math; otherwise it's a probability (never shown as 100%/✓).
        const status: GroupTeamView["status"] =
          cl.winner ? "won_group"
            : cl.top2 || advancedByThird ? "advanced"
            : eliminated ? "eliminated"
            : "live";
        return {
          code: r.code, name: TEAM_BY_CODE[r.code].name, played: r.played, w: r.w, d: r.d, l: r.l,
          gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts, winGroup: p.winGroup, advance: p.advance, status,
        };
      }),
    };
  });

  const r32Opponents: Record<string, OpponentProb[]> = {};
  for (const code in sim.r32Opponents) {
    r32Opponents[code] = Object.entries(sim.r32Opponents[code])
      .map(([opp, prob]) => ({ code: opp, name: TEAM_BY_CODE[opp]?.name ?? opp, prob }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 6);
  }

  // Knockout slots resolve to a definite team only when mathematically locked: a clinched group winner
  // fills its "1X" slot. (Runner-up / W## slots stay projected until decided — honest, no over-claiming.)
  const wonSlot: Record<string, string> = {};
  for (const gv of groups) {
    const w = gv.teams.find((t) => t.status === "won_group");
    if (w) wonSlot["1" + gv.group] = w.code;
  }

  // live results indexed by sorted team-pair (group matches)
  const resByPair = new Map<string, FetchedMatch>();
  for (const r of results) resByPair.set([r.homeCode, r.awayCode].sort().join("-"), r);

  const matches: MatchInfo[] = SCHEDULE.map((s) => {
    const info: MatchInfo = {
      match: s.match, round: s.round, group: s.group, utc: s.utc, venue: s.venue, city: s.city,
      home: null, away: null, homeName: null, awayName: null, defined: false, status: "scheduled",
    };
    if (s.round === "GROUP") {
      info.home = s.home!; info.away = s.away!;
      info.homeName = TEAM_BY_CODE[s.home!].name; info.awayName = TEAM_BY_CODE[s.away!].name;
      info.defined = true;
      const r = resByPair.get([s.home!, s.away!].sort().join("-"));
      if (r) {
        info.status = "final";
        const orient = r.homeCode === s.home;
        info.homeScore = orient ? r.homeGoals : r.awayGoals;
        info.awayScore = orient ? r.awayGoals : r.homeGoals;
      }
    } else {
      info.slotHome = s.homeSlot; info.slotAway = s.awaySlot;
      const proj = sim.matchProjection[s.match];
      info.projHome = topCandidates(proj?.home);
      info.projAway = topCandidates(proj?.away);
      // A slot resolves to a definite team only when mathematically locked (clinched group winner).
      const rh = s.homeSlot ? wonSlot[s.homeSlot] : undefined;
      const ra = s.awaySlot ? wonSlot[s.awaySlot] : undefined;
      if (rh) { info.home = rh; info.homeName = TEAM_BY_CODE[rh].name; }
      if (ra) { info.away = ra; info.awayName = TEAM_BY_CODE[ra].name; }
      info.defined = Boolean(info.home && info.away);
    }
    // forecast for DEFINED matches only (neutral venue)
    if (info.defined && info.status !== "final" && info.home && info.away) {
      const p = wdlProbs((ratings[info.home] ?? 1500) - (ratings[info.away] ?? 1500));
      info.probs = { home: p.win, draw: p.draw, away: p.loss };
      const favCode = p.win >= p.loss ? info.home : info.away;
      info.favorite = { code: favCode, name: TEAM_BY_CODE[favCode].name, winProb: Math.max(p.win, p.loss) };
    }
    return info;
  });

  const byMatch = new Map(matches.map((m) => [m.match, m]));
  const myMatches: MyMatch[] = MY_MATCHES.map((t) => {
    const base = byMatch.get(t.match)!;
    return { ...base, tickets: t.tickets, ticketVenue: t.venue, note: t.note };
  });

  const matchesPlayed = results.filter((r) => r.group != null && r.date.slice(0, 10) <= "2026-06-27").length;

  return {
    updatedAt: new Date().toISOString(),
    iterations,
    matchesPlayed,
    totalGroupMatches: 72,
    teams,
    groups,
    r32Opponents,
    matches,
    myMatches,
  };
}
