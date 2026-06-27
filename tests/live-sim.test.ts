import { describe, it, expect } from "vitest";
import { buildGroupMatches, type LiveMatch } from "../lib/espn";
import { runMonteCarlo } from "../lib/sim/simulate";
import { simulateKnockout, type KOLive } from "../lib/sim/knockout";
import { fracRemaining } from "../lib/sim/poisson";
import { mulberry32 } from "../lib/sim/rng";
import { KNOCKOUT } from "../lib/data/bracket";
import { TEAMS } from "../lib/data/teams";

const ratings = Object.fromEntries(TEAMS.map((t) => [t.code, t.rating]));
const ITER = 4000;
const SEED = 99;

// A group + two of its teams; T is the weakest (so its baseline winGroup is low and a live lead is a clear move).
const GROUP = "A";
const groupCodes = TEAMS.filter((t) => t.group === GROUP).map((t) => t.code);
const T = [...groupCodes].sort((a, b) => (ratings[a] as number) - (ratings[b] as number))[0];
const OPP = groupCodes.find((c) => c !== T)!;

function liveMatch(homeGoals: number, awayGoals: number, minute: number, eloAdj?: number): LiveMatch {
  return { homeCode: T, awayCode: OPP, group: GROUP, homeGoals, awayGoals, state: "in", date: "", detail: `${minute}'`, minute, eventId: "x", eloAdj };
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

  it("a live KNOCKOUT match conditions its advancement (and propagates downstream)", () => {
    const r32matches = KNOCKOUT.filter((m) => m.round === "R32").map((m) => m.match);
    const codes = TEAMS.map((t) => t.code).slice(0, r32matches.length * 2);
    const r32: Record<number, [string, string]> = {};
    r32matches.forEach((mn, i) => (r32[mn] = [codes[2 * i], codes[2 * i + 1]]));
    const mn = r32matches[0];
    const [H, A] = r32[mn];
    const homeWinRate = (liveKO: KOLive) => {
      const rand = mulberry32(5);
      let c = 0;
      for (let i = 0; i < 2500; i++) if (simulateKnockout(r32, ratings, rand, {}, liveKO).winners[mn] === H) c++;
      return c / 2500;
    };
    const base = homeWinRate({});
    const leading = homeWinRate({ [[H, A].sort().join("-")]: { homeCode: H, homeScore: 3, awayScore: 0, frac: fracRemaining(88) } });
    expect(leading).toBeGreaterThan(0.95); // 3-0 with minutes left -> almost certainly through
    expect(leading).toBeGreaterThan(base);
  });

  it("an in-game Elo nudge (e.g. a red card) shifts the live group odds", () => {
    const level = winGroup([liveMatch(0, 0, 70)]); // 0-0, 70'
    const withRed = winGroup([liveMatch(0, 0, 70, -200)]); // same, but a red card against T (home-perspective)
    expect(withRed).toBeLessThan(level);
  });

  it("a live match with an unknown clock is frozen at its current score (counted as played)", () => {
    const noMinute: LiveMatch = { homeCode: T, awayCode: OPP, group: GROUP, homeGoals: 3, awayGoals: 0, state: "in", date: "", detail: "LIVE", minute: null, eventId: "x" };
    const built = buildGroupMatches([], [noMinute]);
    const fixture = built[GROUP].find((m) => (m.home === T && m.away === OPP) || (m.home === OPP && m.away === T))!;
    expect(fixture.played).toBe(true);
    expect(fixture.live).toBeUndefined();
    // oriented to the fixture, T has 3 and OPP has 0
    const tGoals = fixture.home === T ? fixture.homeGoals : fixture.awayGoals;
    expect(tGoals).toBe(3);
  });
});
