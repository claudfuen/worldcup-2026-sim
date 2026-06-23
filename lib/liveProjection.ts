// "If the live score holds" — a provisional, render-time group projection. Treats every in-progress
// match in a group as if it finished at its CURRENT scoreline, then re-ranks and re-clinches with the
// real 2026 tiebreakers. Deterministic and exact; does NOT touch the official (completed-only) table.
import { rankGroup } from "./sim/standings";
import { computeClinch, type GroupClinch } from "./sim/clinch";
import type { GroupMatch, Ratings, TeamRow } from "./sim/types";
import type { MatchInfo } from "./predictions";
import { TEAMS } from "./data/teams";

export interface ProvisionalGroup {
  group: string;
  rows: TeamRow[]; // finishing order if the live score(s) hold
  clinch: GroupClinch; // guaranteed states given the live result holds (other matches still open)
  live: { home: string; away: string; homeGoals: number; awayGoals: number }[];
}

// `groupRows` must be the (overlay-applied) MatchInfo rows for ONE group's six fixtures.
// Returns null when nothing in the group is live (so callers can cheaply skip the panel).
export function provisionalGroup(group: string, groupRows: MatchInfo[], ratings: Ratings): ProvisionalGroup | null {
  const live = groupRows.filter(
    (m) => m.status === "live" && m.home && m.away && m.homeScore != null && m.awayScore != null,
  );
  if (live.length === 0) return null;

  const codes = TEAMS.filter((t) => t.group === group).map((t) => t.code);
  const gms: GroupMatch[] = groupRows
    .filter((m) => m.home && m.away)
    .map((m) => {
      // A live match is frozen at its current score; final stays final; scheduled stays open.
      const played = m.status === "final" || m.status === "live";
      return {
        group,
        home: m.home as string,
        away: m.away as string,
        played,
        homeGoals: played ? m.homeScore : undefined,
        awayGoals: played ? m.awayScore : undefined,
      };
    });

  return {
    group,
    rows: rankGroup(codes, gms, ratings),
    clinch: computeClinch(codes, gms, ratings),
    live: live.map((m) => ({
      home: m.home as string,
      away: m.away as string,
      homeGoals: m.homeScore as number,
      awayGoals: m.awayScore as number,
    })),
  };
}

// Build a code->rating map from the prediction payload's team list (rankGroup uses it only as the
// last-resort FIFA-ranking proxy tiebreak).
export function ratingsFromTeams(teams: { code: string; rating: number }[]): Ratings {
  const r: Ratings = {};
  for (const t of teams) r[t.code] = t.rating;
  return r;
}
