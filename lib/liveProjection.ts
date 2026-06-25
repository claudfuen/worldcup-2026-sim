// "If the live score holds" — a provisional, render-time group projection. Treats every in-progress
// match in a group as if it finished at its CURRENT scoreline, then re-ranks and re-clinches with the
// real 2026 tiebreakers. Deterministic and exact; does NOT touch the official (completed-only) table.
import { rankGroup } from "./sim/standings";
import { computeClinch, type GroupClinch } from "./sim/clinch";
import { rankThirds, selectAndAssignThirds, type ThirdTeam } from "./sim/thirdPlace";
import { buildGroupViews, lockedSlotsFromGroups, type GroupProb } from "./groupView";
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
// known right now. The overlaid match list reflects results the instant ESPN reports them — before the
// 30-min prediction cron catches up. The displayed STANDINGS (order, GD, points, W/D/L) reflect both
// full-time AND in-progress matches (a live score is frozen at its current value), so goal difference and
// positions move while a match is being played. The CLINCH ✓ / "out" / "decided" states are computed from
// FULL-TIME results only, so an unfinished live score can never produce a premature definitive state.
// Monte Carlo probabilities (winGroup/advance) can only be re-run by the cron, so they're carried by code.
// Idempotent: with no live or newly-final matches, this reproduces the cron groups.
export function finalizeGroups(cronGroups: GroupView[], overlaidMatches: MatchInfo[], ratings: Ratings): GroupView[] {
  const rankBy: Record<string, GroupMatch[]> = {}; // ranking set: full-time + live-frozen
  const clinchBy: Record<string, GroupMatch[]> = {}; // certainty set: full-time only
  for (const g of cronGroups) { rankBy[g.group] = []; clinchBy[g.group] = []; }
  for (const m of overlaidMatches) {
    if (m.round !== "GROUP" || !m.group || !m.home || !m.away || !(m.group in rankBy)) continue;
    const final = m.status === "final";
    const live = m.status === "live" && m.homeScore != null && m.awayScore != null;
    const base = { group: m.group, home: m.home, away: m.away };
    rankBy[m.group].push({
      ...base, played: final || live,
      homeGoals: final || live ? m.homeScore : undefined,
      awayGoals: final || live ? m.awayScore : undefined,
    });
    clinchBy[m.group].push({
      ...base, played: final,
      homeGoals: final ? m.homeScore : undefined,
      awayGoals: final ? m.awayScore : undefined,
    });
  }
  const prob = new Map<string, GroupProb>();
  for (const g of cronGroups)
    for (const t of g.teams) prob.set(t.code, { winGroup: t.winGroup, advance: t.advance, advanceDelta: t.advanceDelta });
  return buildGroupViews(rankBy, ratings, (code) => prob.get(code) ?? { winGroup: 0, advance: 0 }, clinchBy).groups;
}

// Render-time BRACKET finalization: lock a knockout match's participants the instant the feeding group
// decides, instead of waiting for the cron. A clinched group winner fills its "1X" slot and a clinched
// runner-up its "2X" slot (this mirrors the cron's lockedSlot logic over the freshly-finalized groups).
// Once the WHOLE group stage is decided, the 8 best thirds and their Annex C slots are deterministic, so
// each third-place R32 slot resolves to its exact team. Only EMPTY slots are filled (cron-locked slots
// and Monte Carlo projections are preserved); W##/L## knockout feeders stay projected. `groups` must be
// the finalized group views (see finalizeGroups).
export function finalizeBracket(matches: MatchInfo[], groups: GroupView[], ratings: Ratings): MatchInfo[] {
  const lockedSlot = lockedSlotsFromGroups(groups);
  let thirdSlotToTeam: Record<string, string> = {};
  if (groups.every((g) => g.decided)) {
    const thirdRows: ThirdTeam[] = groups.map((g) => {
      const t = g.teams[2];
      return { group: g.group, row: { code: t.code, played: t.played, w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga, gd: t.gd, pts: t.pts } };
    });
    try {
      thirdSlotToTeam = selectAndAssignThirds(thirdRows, ratings).slotToTeam;
    } catch {
      /* needs >=8 distinct group thirds; always true with 12 groups */
    }
  }
  return matches.map((m) => {
    if (m.round === "GROUP") return m;
    let home = m.home;
    let away = m.away;
    // clinched group winner/runner-up -> "1X"/"2X" slots
    const lh = m.slotHome ? lockedSlot[m.slotHome] : undefined;
    const la = m.slotAway ? lockedSlot[m.slotAway] : undefined;
    if (lh && !home) home = lh;
    if (la && !away) away = la;
    // deterministic third-place assignment, once the group stage is fully decided
    if (m.round === "R32") {
      const thirdSide = m.slotHome?.startsWith("3:") ? "home" : m.slotAway?.startsWith("3:") ? "away" : null;
      if (thirdSide) {
        const hostSlot = thirdSide === "home" ? m.slotAway : m.slotHome;
        const code = hostSlot ? thirdSlotToTeam[hostSlot] : undefined;
        if (code) {
          if (thirdSide === "home" && !home) home = code;
          else if (thirdSide === "away" && !away) away = code;
        }
      }
    }
    if (home === m.home && away === m.away) return m; // nothing newly locked
    return {
      ...m,
      home,
      away,
      homeName: home ? TEAM_BY_CODE[home]?.name ?? home : m.homeName,
      awayName: away ? TEAM_BY_CODE[away]?.name ?? away : m.awayName,
      defined: Boolean(home && away),
    };
  });
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
// last-resort FIFA-ranking proxy tiebreak). Prefer the FULL-PRECISION ratingExact so render-time
// standings/third-place tiebreaks match the cron exactly (the rounded `rating` is display-only and could
// flip a tie the cron broke the other way).
export function ratingsFromTeams(teams: { code: string; rating: number; ratingExact?: number }[]): Ratings {
  const r: Ratings = {};
  for (const t of teams) r[t.code] = t.ratingExact ?? t.rating;
  return r;
}
