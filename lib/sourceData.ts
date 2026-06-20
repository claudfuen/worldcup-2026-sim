// Source-of-truth endpoint data: the raw ingested inputs (ESPN results, live ratings, current standings,
// mathematical clinch states) so predictions can be QA'd against ground truth.
import { fetchResults, liveRatings, buildGroupMatches } from "./espn";
import { rankGroup } from "./sim/standings";
import { computeClinch } from "./sim/clinch";
import { TEAMS, TEAM_BY_CODE, GROUPS } from "./data/teams";

export interface SourceData {
  fetchedAt: string;
  completedMatches: number;
  results: { date: string; group: string | null; home: string; away: string; homeGoals: number; awayGoals: number }[];
  ratings: Record<string, number>;
  standings: {
    group: string;
    decided: boolean;
    rows: {
      code: string; name: string; played: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number;
      clinch: { winner: boolean; second: boolean; top2: boolean; eliminatedTop2: boolean; guaranteedTop3: boolean };
    }[];
  }[];
}

export async function computeSourceData(): Promise<SourceData> {
  const results = await fetchResults();
  const ratings = liveRatings(results);
  const groupMatches = buildGroupMatches(results);

  const standings = GROUPS.map((g) => {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    const rows = rankGroup(codes, groupMatches[g], ratings);
    const clinch = computeClinch(codes, groupMatches[g], ratings);
    return {
      group: g,
      decided: groupMatches[g].every((m) => m.played),
      rows: rows.map((r) => ({
        code: r.code, name: TEAM_BY_CODE[r.code].name, played: r.played, w: r.w, d: r.d, l: r.l,
        gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts, clinch: clinch[r.code],
      })),
    };
  });

  return {
    fetchedAt: new Date().toISOString(),
    completedMatches: results.length,
    results: results.map((r) => ({
      date: r.date, group: r.group, home: r.homeCode, away: r.awayCode, homeGoals: r.homeGoals, awayGoals: r.awayGoals,
    })),
    ratings: Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, Math.round(v)])),
    standings,
  };
}
