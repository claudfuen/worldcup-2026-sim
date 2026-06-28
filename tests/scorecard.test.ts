// Scorecard accuracy math: multi-class Brier, favourite hit-rate, calibration bucketing, and the
// pre-tournament champion / advance call. Pure functions, deterministic.
import { describe, it, expect } from "vitest";
import { computeMatchAccuracy, computeTournamentAccuracy } from "../lib/scorecard";
import type { MatchInfo } from "../lib/predictions";

const m = (over: Partial<MatchInfo>): MatchInfo => ({ status: "final", round: "GROUP", home: "AAA", away: "BBB", ...over } as MatchInfo);

describe("computeMatchAccuracy", () => {
  // A: model favours home (0.60), home wins → hit. B: model favours away (0.50), it's a draw → miss.
  const matches = [
    m({ probs: { home: 0.6, draw: 0.25, away: 0.15 }, homeScore: 2, awayScore: 0 }),
    m({ home: "CCC", away: "DDD", probs: { home: 0.2, draw: 0.3, away: 0.5 }, homeScore: 1, awayScore: 1 }),
  ];

  it("scores Brier, favourite hit-rate and a no-skill baseline", () => {
    const a = computeMatchAccuracy(matches)!;
    expect(a.n).toBe(2);
    // Brier = mean of [(.6-1)²+.25²+.15²]=.245 and [.2²+(.3-1)²+.5²]=.78 → .5125
    expect(a.brier).toBeCloseTo(0.5125, 4);
    expect(a.favouriteAccuracy).toBe(0.5); // 1 of 2 picks correct
    // outcomes home+draw → base rates .5/.5/0 → baseline Brier .5 for both → .5
    expect(a.brierBaseline).toBeCloseTo(0.5, 4);
    expect(a.skill).toBeCloseTo(1 - 0.5125 / 0.5, 4);
  });

  it("buckets calibration by the top-pick confidence", () => {
    const a = computeMatchAccuracy(matches)!;
    // .60 → 60–70 bucket (hit), .50 → 50–60 bucket (miss)
    const b60 = a.calibration.find((b) => b.label === "60–70%")!;
    expect(b60.n).toBe(1);
    expect(b60.actual).toBe(1);
    const b50 = a.calibration.find((b) => b.label === "50–60%")!;
    expect(b50.actual).toBe(0);
  });

  it("returns null with no completed matches", () => {
    expect(computeMatchAccuracy([m({ status: "scheduled", probs: undefined })])).toBeNull();
  });

  it("treats a knockout level after 90 as a draw (regulation result)", () => {
    // 1-1, won on penalties (winner set) — the regulation outcome is a draw, which is what W/D/L predicted.
    const ko = [m({ round: "R32", probs: { home: 0.5, draw: 0.3, away: 0.2 }, homeScore: 1, awayScore: 1, winner: "AAA" })];
    const a = computeMatchAccuracy(ko)!;
    // pick = home (.5) but regulation outcome = draw → miss
    expect(a.favouriteAccuracy).toBe(0);
  });
});

describe("computeTournamentAccuracy", () => {
  const pre = { ARG: { advance: 0.95, title: 0.3 }, BRA: { advance: 0.9, title: 0.25 }, FRA: { advance: 0.85, title: 0.2 } };

  it("ranks the actual champion in the pre-tournament title odds", () => {
    const out = computeTournamentAccuracy([], "BRA", pre);
    expect(out.championCode).toBe("BRA");
    expect(out.championRank).toBe(2); // ARG .3 > BRA .25
    expect(out.championProb).toBeCloseTo(0.25, 4);
  });

  it("leaves advance hit-rate unset until all 32 R32 teams are known", () => {
    const out = computeTournamentAccuracy([m({ round: "R32", home: "ARG", away: "BRA" })], undefined, pre);
    expect(out.advanceTotal).toBeUndefined();
  });
});
