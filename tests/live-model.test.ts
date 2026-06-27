import { describe, it, expect } from "vitest";
import {
  fracRemaining,
  liveWdl,
  liveKoAdvance,
  sampleRemainingScoreline,
  wdlProbs,
} from "../lib/sim/poisson";
import { mulberry32 } from "../lib/sim/rng";
import { parseLiveMinute } from "../lib/espn";

describe("parseLiveMinute", () => {
  it("reads the soccer clock string", () => {
    expect(parseLiveMinute("63'")).toBe(63);
    expect(parseLiveMinute("45'+2'")).toBe(47);
    expect(parseLiveMinute("90'+4'")).toBe(94);
    expect(parseLiveMinute("12'")).toBe(12);
  });
  it("maps half-time and full-time/extra states", () => {
    expect(parseLiveMinute("HT")).toBe(45);
    expect(parseLiveMinute(undefined, "Halftime")).toBe(45);
    expect(parseLiveMinute("FT")).toBe(90);
    expect(parseLiveMinute(undefined, "AET")).toBe(90);
    expect(parseLiveMinute(undefined, "FT-Pens")).toBe(90);
  });
  it("falls back to the period midpoint, else null", () => {
    expect(parseLiveMinute(undefined, undefined, 1)).toBe(23);
    expect(parseLiveMinute(undefined, undefined, 2)).toBe(68);
    expect(parseLiveMinute("", "", undefined)).toBeNull();
  });
});

describe("fracRemaining", () => {
  it("is 1 at kickoff, 0.5 at half time, a small sliver at/after full time (stoppage variance, never 0)", () => {
    expect(fracRemaining(0)).toBeCloseTo(1, 6);
    expect(fracRemaining(45)).toBeCloseTo(0.5, 6);
    expect(fracRemaining(90)).toBeCloseTo(0.03, 6); // floored, not 0 — there's always stoppage time
    expect(fracRemaining(96)).toBeCloseTo(0.03, 6);
    expect(fracRemaining(90)).toBeGreaterThan(0);
  });
  it("defaults to a full match when the minute is unknown", () => {
    expect(fracRemaining(null)).toBe(1);
    expect(fracRemaining(undefined)).toBe(1);
    expect(fracRemaining(NaN)).toBe(1);
  });
});

describe("liveWdl", () => {
  it("at kickoff (frac=1, 0-0) reproduces the pre-match read (sans DC)", () => {
    const diff = 80;
    const live = liveWdl(diff, 0, 0, 1);
    const pre = wdlProbs(diff, { rho: 0 }); // DC off to match liveWdl's independent Poisson
    expect(live.win).toBeCloseTo(pre.win, 2);
    expect(live.draw).toBeCloseTo(pre.draw, 2);
    expect(live.loss).toBeCloseTo(pre.loss, 2);
  });

  it("with no time left the current score is certain", () => {
    const lead = liveWdl(0, 1, 0, 0); // 1-0, match over
    expect(lead.win).toBeCloseTo(1, 6);
    expect(lead.draw).toBeCloseTo(0, 6);
    expect(lead.loss).toBeCloseTo(0, 6);

    const level = liveWdl(0, 1, 1, 0);
    expect(level.draw).toBeCloseTo(1, 6);
  });

  it("a 1-0 lead late is far stronger than the same matchup at kickoff", () => {
    const diff = 0; // evenly matched on paper
    const kickoff = liveWdl(diff, 0, 0, 1).win;
    const lateLead = liveWdl(diff, 1, 0, fracRemaining(75)).win; // 1-0 in the 75th
    expect(lateLead).toBeGreaterThan(kickoff + 0.3);
    expect(lateLead).toBeGreaterThan(0.8);
  });

  it("a side that's behind can still recover more when more time remains", () => {
    const diff = 0;
    const downEarly = liveWdl(diff, 0, 1, fracRemaining(20)).win; // 0-1, lots of time
    const downLate = liveWdl(diff, 0, 1, fracRemaining(80)).win; // 0-1, almost over
    expect(downEarly).toBeGreaterThan(downLate);
  });

  it("probabilities always sum to 1", () => {
    for (const [hg, ag, m] of [
      [0, 0, 10],
      [2, 1, 60],
      [0, 3, 85],
    ] as const) {
      const p = liveWdl(120, hg, ag, fracRemaining(m));
      expect(p.win + p.draw + p.loss).toBeCloseTo(1, 6);
    }
  });
});

describe("liveKoAdvance", () => {
  it("a level knockout tie is ~50/50 between evenly matched sides", () => {
    const adv = liveKoAdvance(0, 1, 1, fracRemaining(80));
    expect(adv).toBeGreaterThan(0.4);
    expect(adv).toBeLessThan(0.6);
  });
  it("leading late in a knockout means very likely to advance", () => {
    const adv = liveKoAdvance(0, 1, 0, fracRemaining(85));
    expect(adv).toBeGreaterThan(0.85);
  });
  it("a draw still leaves shootout chances (advance prob strictly between the regulation win and 1)", () => {
    const drawnAdv = liveKoAdvance(0, 0, 0, fracRemaining(88));
    expect(drawnAdv).toBeGreaterThan(0.3);
    expect(drawnAdv).toBeLessThan(0.7);
  });
});

describe("sampleRemainingScoreline", () => {
  it("never returns fewer goals than are already on the board", () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 200; i++) {
      const [h, a] = sampleRemainingScoreline(0, 2, 1, fracRemaining(70), rand);
      expect(h).toBeGreaterThanOrEqual(2);
      expect(a).toBeGreaterThanOrEqual(1);
    }
  });
  it("with no time left returns exactly the current score", () => {
    const rand = mulberry32(1);
    const [h, a] = sampleRemainingScoreline(50, 3, 1, 0, rand);
    expect(h).toBe(3);
    expect(a).toBe(1);
  });
  it("averaged samples track liveWdl's win probability", () => {
    const rand = mulberry32(7);
    const N = 4000;
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const [h, a] = sampleRemainingScoreline(0, 1, 0, fracRemaining(60), rand);
      if (h > a) wins++;
    }
    const empirical = wins / N;
    const analytic = liveWdl(0, 1, 0, fracRemaining(60)).win;
    expect(empirical).toBeCloseTo(analytic, 1);
  });
});
