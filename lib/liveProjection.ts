// "If the live score holds" — a provisional, render-time group projection. Treats every in-progress
// match in a group as if it finished at its CURRENT scoreline, then re-ranks and re-clinches with the
// real 2026 tiebreakers. Deterministic and exact; does NOT touch the official (completed-only) table.
import { rankGroup } from "./sim/standings";
import { computeClinch, type GroupClinch } from "./sim/clinch";
import { rankThirds, type ThirdTeam } from "./sim/thirdPlace";
import { buildGroupViews, type GroupProb } from "./groupView";
import type { GroupMatch, Ratings, TeamRow } from "./sim/types";
import type { GroupView, MatchInfo, ThirdPlaceEntry } from "./predictions";
import { TEAMS, TEAM_BY_CODE } from "./data/teams";

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

// Render-time FINALIZATION: recompute each group's standings + clinch + definitive status from the matches
// known right now. The overlaid match list reflects full-time results the instant ESPN reports them — before
// the 30-min prediction cron catches up — so a finished match finalizes the table, ranking and clinch ✓
// immediately instead of lagging. Only FINAL matches count (the official table is full-time results only;
// the "if the live score holds" provisional panel handles in-progress games). Monte Carlo probabilities
// (winGroup/advance) can only be re-run by the cron, so they're carried forward by team code.
// Idempotent: with no new finals beyond the cron payload, this reproduces the cron groups.
export function finalizeGroups(cronGroups: GroupView[], overlaidMatches: MatchInfo[], ratings: Ratings): GroupView[] {
  const byGroup: Record<string, GroupMatch[]> = {};
  for (const g of cronGroups) byGroup[g.group] = [];
  for (const m of overlaidMatches) {
    if (m.round !== "GROUP" || !m.group || !m.home || !m.away || !(m.group in byGroup)) continue;
    const played = m.status === "final";
    byGroup[m.group].push({
      group: m.group, home: m.home, away: m.away, played,
      homeGoals: played ? m.homeScore : undefined,
      awayGoals: played ? m.awayScore : undefined,
    });
  }
  const prob = new Map<string, GroupProb>();
  for (const g of cronGroups)
    for (const t of g.teams) prob.set(t.code, { winGroup: t.winGroup, advance: t.advance, advanceDelta: t.advanceDelta });
  return buildGroupViews(byGroup, ratings, (code) => prob.get(code) ?? { winGroup: 0, advance: 0 }).groups;
}

// Recompute the cross-group third-place race "if the live scores hold", so it stays consistent with the
// live group cards above it. For any group with an in-progress match we take its PROVISIONAL 3rd-placed
// team (live score frozen); every other group keeps its official (cron) 3rd. The 12 thirds are then
// re-ranked (points -> GD -> GF -> FIFA-ranking proxy) and the top 8 marked as advancing — exactly the
// model the cron uses, just over the frozen-live snapshot. Slot/Annex-C fields are intentionally omitted
// (the race table doesn't show them; the bracket owns projected matchups).
export function liveThirdPlaceRace(
  groups: GroupView[],
  provByGroup: Record<string, ProvisionalGroup | null>,
  ratings: Ratings,
): ThirdPlaceEntry[] {
  // Per-team Monte Carlo advance prob + clinch status come from the (cron) group views — they can't be
  // re-simulated at render time, so we carry them by code, same as the calibrated number on the group cards.
  const meta = new Map<string, { advance: number; status: GroupView["teams"][number]["status"] }>();
  for (const g of groups) for (const t of g.teams) meta.set(t.code, { advance: t.advance, status: t.status });

  const thirds: ThirdTeam[] = groups.map((g) => {
    const prov = provByGroup[g.group];
    if (prov) return { group: g.group, row: prov.rows[2] };
    const t = g.teams[2]; // official standings already in finishing order; index 2 = current 3rd
    const row: TeamRow = {
      code: t.code, played: t.played, w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga, gd: t.gd, pts: t.pts,
    };
    return { group: g.group, row };
  });
  const ranked = rankThirds(thirds, ratings);
  const advancing = new Set(ranked.slice(0, 8).map((t) => t.group));
  return ranked.map((t, i) => {
    const m = meta.get(t.row.code);
    return {
      rank: i + 1,
      group: t.group,
      code: t.row.code,
      name: TEAM_BY_CODE[t.row.code]?.name ?? t.row.code,
      pts: t.row.pts,
      gd: t.row.gd,
      gf: t.row.gf,
      advancing: advancing.has(t.group),
      advanceProb: m?.advance ?? 0,
      status: m?.status ?? "live",
    };
  });
}

// Build a code->rating map from the prediction payload's team list (rankGroup uses it only as the
// last-resort FIFA-ranking proxy tiebreak).
export function ratingsFromTeams(teams: { code: string; rating: number }[]): Ratings {
  const r: Ratings = {};
  for (const t of teams) r[t.code] = t.rating;
  return r;
}
