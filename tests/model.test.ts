import { describe, it, expect } from "vitest";
import { expectedScore, updateElo, movMultiplier } from "../lib/sim/elo";
import { eloToLambdas, wdlProbs, sampleScoreline } from "../lib/sim/poisson";
import { mulberry32 } from "../lib/sim/rng";

describe("Elo", () => {
  it("expectedScore is 0.5 at parity and monotone in rating gap", () => {
    expect(expectedScore(0)).toBeCloseTo(0.5, 6);
    expect(expectedScore(400)).toBeCloseTo(0.909, 2);
    expect(expectedScore(200)).toBeGreaterThan(expectedScore(0));
    expect(expectedScore(-200)).toBeLessThan(0.5);
  });
  it("winner gains rating, loser loses the same amount (zero-sum)", () => {
    const [h, a] = updateElo(1500, 1500, 2, 0, { neutral: true, weight: 1 });
    expect(h).toBeGreaterThan(1500);
    expect(a).toBeLessThan(1500);
    expect(h - 1500).toBeCloseTo(1500 - a, 6);
  });
  it("a bigger win moves ratings more", () => {
    expect(movMultiplier(4, 0)).toBeGreaterThan(movMultiplier(1, 0));
  });
});

describe("Poisson scoreline model", () => {
  it("expected goals are positive and favor the stronger side", () => {
    const [lh, la] = eloToLambdas(200);
    expect(lh).toBeGreaterThan(0);
    expect(la).toBeGreaterThan(0);
    expect(lh).toBeGreaterThan(la);
  });
  it("W/D/L probabilities sum to 1 and favor the stronger side", () => {
    for (const d of [-300, -100, 0, 150, 500]) {
      const p = wdlProbs(d);
      expect(p.win + p.draw + p.loss).toBeCloseTo(1, 6);
    }
    const strong = wdlProbs(300);
    expect(strong.win).toBeGreaterThan(strong.loss);
    const even = wdlProbs(0);
    expect(even.win).toBeCloseTo(even.loss, 6);
  });
  it("sampleScoreline is deterministic for a given seed", () => {
    const a = sampleScoreline(150, mulberry32(42));
    const b = sampleScoreline(150, mulberry32(42));
    expect(a).toEqual(b);
  });
});
