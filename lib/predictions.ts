// End-to-end: pull live results -> live ratings -> Monte Carlo -> assemble the payload stored in KV / rendered.
import { fetchResults, liveRatings, buildGroupMatches } from "./espn";
import { runMonteCarlo } from "./sim/simulate";
import { rankGroup } from "./sim/standings";
import { TEAMS, TEAM_BY_CODE, GROUPS } from "./data/teams";
import type { TeamProb } from "./sim/simulate";

export interface TeamPrediction extends TeamProb {
  name: string;
  rating: number;
}

export interface GroupTeamView {
  code: string;
  name: string;
  played: number;
  w: number;
  d: number;
  l: number;
  gd: number;
  pts: number;
  winGroup: number;
  advance: number;
}

export interface GroupView {
  group: string;
  teams: GroupTeamView[];
}

export interface OpponentProb {
  code: string;
  name: string;
  prob: number;
}

export interface PredictionsPayload {
  updatedAt: string;
  iterations: number;
  matchesPlayed: number;
  totalGroupMatches: number;
  teams: TeamPrediction[];
  groups: GroupView[];
  r32Opponents: Record<string, OpponentProb[]>;
}

export async function computePredictions(iterations = 20000, seed = 20260611): Promise<PredictionsPayload> {
  const results = await fetchResults();
  const ratings = liveRatings(results);
  const groupMatches = buildGroupMatches(results);
  const sim = runMonteCarlo(groupMatches, ratings, iterations, seed);

  const teams: TeamPrediction[] = Object.values(sim.teams)
    .map((t) => ({ ...t, name: TEAM_BY_CODE[t.code].name, rating: Math.round(ratings[t.code] ?? TEAM_BY_CODE[t.code].rating) }))
    .sort((a, b) => b.title - a.title);

  const groups: GroupView[] = GROUPS.map((g) => {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    const rows = rankGroup(codes, groupMatches[g], ratings);
    return {
      group: g,
      teams: rows.map((r) => {
        const p = sim.teams[r.code];
        return {
          code: r.code, name: TEAM_BY_CODE[r.code].name, played: r.played, w: r.w, d: r.d, l: r.l,
          gd: r.gd, pts: r.pts, winGroup: p.winGroup, advance: p.advance,
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

  const matchesPlayed = results.filter((r) => r.group != null && r.date.slice(0, 10) <= "2026-06-27").length;

  return {
    updatedAt: new Date().toISOString(),
    iterations,
    matchesPlayed,
    totalGroupMatches: 72,
    teams,
    groups,
    r32Opponents,
  };
}
