import { describe, it, expect } from "vitest";
import { runMonteCarlo, roundRobin } from "../lib/sim/simulate";
import { TEAMS, GROUPS } from "../lib/data/teams";
import type { GroupMatch } from "../lib/sim/types";

const ratings = Object.fromEntries(TEAMS.map((t) => [t.code, t.rating]));
const groupMatches: Record<string, GroupMatch[]> = {};
for (const g of GROUPS) groupMatches[g] = roundRobin(g, TEAMS.filter((t) => t.group === g).map((t) => t.code));

describe("Monte Carlo (full pre-tournament, no results yet)", () => {
  const res = runMonteCarlo(groupMatches, ratings, 2000, 1);

  it("probabilities are valid and exactly one winner per group", () => {
    for (const c in res.teams) {
      const t = res.teams[c];
      for (const v of [t.winGroup, t.advance, t.title, t.r16, t.qf, t.sf, t.final])
        expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    }
    for (const g of GROUPS) {
      const sum = Object.values(res.teams).filter((t) => t.group === g).reduce((s, t) => s + t.winGroup, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("exactly 32 teams advance and exactly one champion per tournament", () => {
    const advance = Object.values(res.teams).reduce((s, t) => s + t.advance, 0);
    expect(advance).toBeCloseTo(32, 5);
    const titles = Object.values(res.teams).reduce((s, t) => s + t.title, 0);
    expect(titles).toBeCloseTo(1, 5);
  });

  it("monotonic round funnel per team (advance >= r16 >= qf >= sf >= final >= title)", () => {
    for (const c in res.teams) {
      const t = res.teams[c];
      expect(t.advance + 1e-9).toBeGreaterThanOrEqual(t.r16);
      expect(t.r16 + 1e-9).toBeGreaterThanOrEqual(t.qf);
      expect(t.qf + 1e-9).toBeGreaterThanOrEqual(t.sf);
      expect(t.sf + 1e-9).toBeGreaterThanOrEqual(t.final);
      expect(t.final + 1e-9).toBeGreaterThanOrEqual(t.title);
    }
  });

  it("gut check: a top side outranks a minnow on title probability", () => {
    expect(res.teams["ESP"].title).toBeGreaterThan(res.teams["HAI"].title);
    expect(res.teams["BRA"].advance).toBeGreaterThan(res.teams["HAI"].advance);
  });
});
