import { describe, it, expect } from "vitest";
import { buildGroupMatches, type LiveMatch } from "../lib/espn";
import { runMonteCarlo } from "../lib/sim/simulate";
import { TEAMS } from "../lib/data/teams";

const ratings = Object.fromEntries(TEAMS.map((t) => [t.code, t.rating]));
const ITER = 4000;
const SEED = 99;

// A group + two of its teams; T is the weakest (so its baseline winGroup is low and a live lead is a clear move).
const GROUP = "A";
const groupCodes = TEAMS.filter((t) => t.group === GROUP).map((t) => t.code);
const T = [...groupCodes].sort((a, b) => (ratings[a] as number) - (ratings[b] as number))[0];
const OPP = groupCodes.find((c) => c !== T)!;

function liveMatch(homeGoals: number, awayGoals: number, minute: number): LiveMatch {
  return { homeCode: T, awayCode: OPP, group: GROUP, homeGoals, awayGoals, state: "in", date: "", detail: `${minute}'`, minute };
}

function winGroup(live: LiveMatch[]): number {
  return runMonteCarlo(buildGroupMatches([], live), ratings, ITER, SEED).teams[T].winGroup;
}
function advance(code: string, live: LiveMatch[]): number {
  return runMonteCarlo(buildGroupMatches([], live), ratings, ITER, SEED).teams[code].advance;
}

describe("live-conditioned Monte Carlo", () => {
  it("a 2-0 lead late sharply raises the leader's win-group probability", () => {
    const base = winGroup([]);
    const leading = winGroup([liveMatch(2, 0, 85)]);
    expect(leading).toBeGreaterThan(base + 0.1);
  });

  it("the leader's edge grows as the match runs down (same scoreline, less time left)", () => {
    const early = winGroup([liveMatch(1, 0, 20)]);
    const late = winGroup([liveMatch(1, 0, 85)]);
    expect(late).toBeGreaterThan(early);
  });

  it("trailing live drags the leader's group rival down (downstream effect)", () => {
    const baseOpp = advance(OPP, []);
    const oppTrailing = advance(OPP, [liveMatch(2, 0, 85)]); // OPP is losing 0-2
    expect(oppTrailing).toBeLessThan(baseOpp);
  });

  it("at kickoff (0-0, frac~1) the odds are ~unchanged from a not-started match", () => {
    const base = winGroup([]);
    const kickoff = winGroup([liveMatch(0, 0, 1)]);
    expect(Math.abs(kickoff - base)).toBeLessThan(0.05);
  });

  it("a live match with an unknown clock is frozen at its current score (counted as played)", () => {
    const noMinute: LiveMatch = { homeCode: T, awayCode: OPP, group: GROUP, homeGoals: 3, awayGoals: 0, state: "in", date: "", detail: "LIVE", minute: null };
    const built = buildGroupMatches([], [noMinute]);
    const fixture = built[GROUP].find((m) => (m.home === T && m.away === OPP) || (m.home === OPP && m.away === T))!;
    expect(fixture.played).toBe(true);
    expect(fixture.live).toBeUndefined();
    // oriented to the fixture, T has 3 and OPP has 0
    const tGoals = fixture.home === T ? fixture.homeGoals : fixture.awayGoals;
    expect(tGoals).toBe(3);
  });
});
