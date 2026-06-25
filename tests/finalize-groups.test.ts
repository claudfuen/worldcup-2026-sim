// Tests for render-time finalization (lib/liveProjection.ts `finalizeGroups`): finished matches must
// finalize standings/clinch instantly; in-progress matches must NOT count; with no new finals it must
// reproduce the cron group views exactly (idempotent).
import { describe, it, expect } from "vitest";
import { SCHEDULE } from "../lib/data/schedule";
import { TEAMS, GROUPS } from "../lib/data/teams";
import { buildGroupViews } from "../lib/groupView";
import { finalizeGroups } from "../lib/liveProjection";
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

describe("finalizeGroups — in-progress matches do NOT count toward the official table", () => {
  it("a live match is treated as not played (official table = full-time only)", () => {
    const groupA = GROUP_SCHED.filter((s) => s.group === "A").sort((a, b) => a.utc.localeCompare(b.utc));
    const lastA = groupA[groupA.length - 1].match;
    const cron = buildGroupViews(groupMatches((m) => m !== lastA), ratings, dummyProb).groups;
    // overlay marks the missing match LIVE (in progress), the rest final
    const overlaid = matchInfos((m) => (m === lastA ? "live" : "final"));
    const out = finalizeGroups(cron, overlaid, ratings);
    // Group A still NOT decided (the live game isn't full-time)
    expect(out.find((g) => g.group === "A")!.decided).toBe(false);
    // and it equals the cron view (live game ignored), i.e. unchanged
    expect(sig([out.find((g) => g.group === "A")!])).toEqual(sig([cron.find((g) => g.group === "A")!]));
  });
});
