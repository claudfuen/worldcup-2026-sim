// Tests for render-time finalization (lib/liveProjection.ts `finalizeGroups`): finished matches must
// finalize standings/clinch instantly; in-progress matches must NOT count; with no new finals it must
// reproduce the cron group views exactly (idempotent).
import { describe, it, expect } from "vitest";
import { SCHEDULE } from "../lib/data/schedule";
import { TEAMS, GROUPS } from "../lib/data/teams";
import { buildGroupViews } from "../lib/groupView";
import { finalizeGroups, ratingsFromTeams } from "../lib/liveProjection";
import type { MatchInfo } from "../lib/predictions";
import type { GroupMatch, Ratings } from "../lib/sim/types";

const ratings: Ratings = Object.fromEntries(TEAMS.map((t) => [t.code, t.rating]));
const GROUP_SCHED = SCHEDULE.filter((s) => s.round === "GROUP");
// deterministic, varied scoreline from the match number
const score = (n: number): [number, number] => [(n * 2) % 4, (n * 3) % 3];
const dummyProb = () => ({ winGroup: 0, advance: 0 });

// Build groupMatches; `isFinal(match#)` decides which carry a result.
function groupMatches(isFinal: (m: number) => boolean): Record<string, GroupMatch[]> {
  const byGroup: Record<string, GroupMatch[]> = {};
  for (const g of GROUPS) byGroup[g] = [];
  for (const s of GROUP_SCHED) {
    const fin = isFinal(s.match);
    const [h, a] = score(s.match);
    byGroup[s.group!].push({
      group: s.group!, home: s.home!, away: s.away!, played: fin,
      homeGoals: fin ? h : undefined, awayGoals: fin ? a : undefined,
    });
  }
  return byGroup;
}

// Build the overlaid MatchInfo[] the pages pass in. `statusOf` controls final/live/scheduled per match#.
function matchInfos(statusOf: (m: number) => "final" | "live" | "scheduled"): MatchInfo[] {
  return GROUP_SCHED.map((s) => {
    const st = statusOf(s.match);
    const [h, a] = score(s.match);
    const scored = st === "final" || st === "live";
    return {
      match: s.match, round: "GROUP", group: s.group, utc: s.utc, venue: s.venue, city: s.city,
      home: s.home!, away: s.away!, homeName: s.home!, awayName: s.away!, defined: true, status: st,
      homeScore: scored ? h : undefined, awayScore: scored ? a : undefined,
    } as MatchInfo;
  });
}

// Compact comparable signature of a group view set.
function sig(groups: { group: string; decided: boolean; teams: { code: string; pts: number; gd: number; status: string }[] }[]) {
  return groups.map((g) => ({
    group: g.group, decided: g.decided,
    teams: g.teams.map((t) => `${t.code}:${t.pts}:${t.gd}:${t.status}`),
  }));
}

describe("finalizeGroups — idempotent when nothing new beyond the cron payload", () => {
  it("all matches final: reproduces the cron group views exactly", () => {
    const gm = groupMatches(() => true);
    const cron = buildGroupViews(gm, ratings, dummyProb).groups;
    const overlaid = matchInfos(() => "final");
    const out = finalizeGroups(cron, overlaid, ratings);
    expect(sig(out)).toEqual(sig(cron));
  });

  it("partial (some finals) with overlay matching cron: no change", () => {
    const isFinal = (m: number) => m % 2 === 0; // arbitrary subset
    const cron = buildGroupViews(groupMatches(isFinal), ratings, dummyProb).groups;
    const overlaid = matchInfos((m) => (isFinal(m) ? "final" : "scheduled"));
    expect(sig(finalizeGroups(cron, overlaid, ratings))).toEqual(sig(cron));
  });
});

describe("finalizeGroups — a match that just went final finalizes instantly", () => {
  // Cron knows everything EXCEPT Group A's last-by-time match; the overlay has it final.
  const groupA = GROUP_SCHED.filter((s) => s.group === "A").sort((a, b) => a.utc.localeCompare(b.utc));
  const lastA = groupA[groupA.length - 1].match;

  const cronGroups = buildGroupViews(groupMatches((m) => m !== lastA), ratings, dummyProb).groups;
  const overlaid = matchInfos(() => "final"); // overlay has every match (incl. lastA) at full-time
  const out = finalizeGroups(cronGroups, overlaid, ratings);

  it("Group A is not decided in the cron payload but IS after finalization", () => {
    expect(cronGroups.find((g) => g.group === "A")!.decided).toBe(false);
    expect(out.find((g) => g.group === "A")!.decided).toBe(true);
  });
  it("finalized Group A matches a fresh full-build of the same results", () => {
    const fresh = buildGroupViews(groupMatches(() => true), ratings, dummyProb).groups.find((g) => g.group === "A")!;
    const fin = out.find((g) => g.group === "A")!;
    expect(sig([fin])).toEqual(sig([fresh]));
  });
});

describe("finalizeGroups — in-progress matches move the STANDINGS but never the clinch/decided state", () => {
  const groupA = GROUP_SCHED.filter((s) => s.group === "A").sort((a, b) => a.utc.localeCompare(b.utc));
  const lastA = groupA[groupA.length - 1].match;
  // cron knows everything except Group A's last match; the overlay has that match LIVE (in progress).
  const cron = buildGroupViews(groupMatches((m) => m !== lastA), ratings, dummyProb).groups;
  const overlaid = matchInfos((m) => (m === lastA ? "live" : "final"));
  const out = finalizeGroups(cron, overlaid, ratings);
  const A = out.find((g) => g.group === "A")!;

  it("Group A is NOT decided (a live game is not full-time) and no team clinches off the live score", () => {
    expect(A.decided).toBe(false);
    // clinch/status must match the FINAL-ONLY view (live game excluded from certainty)
    const finalOnly = cron.find((g) => g.group === "A")!;
    const statusByCode = (gv: typeof A) => Object.fromEntries(gv.teams.map((t) => [t.code, t.status]));
    expect(statusByCode(A)).toEqual(statusByCode(finalOnly));
  });

  it("but the live score IS reflected in goal difference / points / order", () => {
    // Standings (pts/gd, ignoring status) must match the view where the live match counts as played.
    const asIfPlayed = buildGroupViews(groupMatches(() => true), ratings, dummyProb).groups.find((g) => g.group === "A")!;
    const standings = (gv: typeof A) => gv.teams.map((t) => `${t.code}:${t.pts}:${t.gd}`);
    expect(standings(A)).toEqual(standings(asIfPlayed));
  });
});

describe("ratingsFromTeams — uses full-precision ratingExact (so render-time tiebreaks match the cron)", () => {
  it("prefers ratingExact over the rounded rating, falls back when absent", () => {
    const r = ratingsFromTeams([
      { code: "AAA", rating: 1850, ratingExact: 1850.73 },
      { code: "BBB", rating: 1700 }, // no ratingExact -> falls back to rating
    ]);
    expect(r.AAA).toBe(1850.73);
    expect(r.BBB).toBe(1700);
  });
});
