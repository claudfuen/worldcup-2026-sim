import { describe, it, expect } from "vitest";
import { buildR32, simulateKnockout, type GroupOutcome } from "../lib/sim/knockout";
import { mulberry32 } from "../lib/sim/rng";

// Group outcome: each group letter -> [winner, runnerUp, third, fourth] codes like "Aw","Ar","A3","A4".
const groups: GroupOutcome = Object.fromEntries(
  "ABCDEFGHIJKL".split("").map((g) => [g, [`${g}w`, `${g}r`, `${g}3`, `${g}4`]]),
);
// host slot -> third team code (arbitrary but distinct)
const slotToTeam: Record<string, string> = {
  "1A": "X1", "1B": "X2", "1D": "X3", "1E": "X4", "1G": "X5", "1I": "X6", "1K": "X7", "1L": "X8",
};

describe("buildR32 resolves slot references correctly", () => {
  const r32 = buildR32(groups, slotToTeam);
  it("M76 = 1C vs 2F", () => expect(r32[76]).toEqual(["Cw", "Fr"]));
  it("M75 = 1F vs 2C (distinct from M76)", () => expect(r32[75]).toEqual(["Fw", "Cr"]));
  it("M73 = 2A vs 2B", () => expect(r32[73]).toEqual(["Ar", "Br"]));
  it("M84 = 1H vs 2J", () => expect(r32[84]).toEqual(["Hw", "Jr"]));
  it("M79 = 1A (Mexico) vs its assigned third", () => expect(r32[79]).toEqual(["Aw", "X1"]));
  it("M82 = 1G vs its assigned third", () => expect(r32[82]).toEqual(["Gw", "X5"]));
  it("produces exactly 16 matches with 32 distinct teams", () => {
    expect(Object.keys(r32).length).toBe(16);
    const teams = Object.values(r32).flat();
    expect(new Set(teams).size).toBe(32);
  });
});

describe("simulateKnockout", () => {
  const r32 = buildR32(groups, slotToTeam);
  const ratings = Object.fromEntries(Object.values(r32).flat().map((c, i) => [c, 1500 + i]));
  it("produces a champion among the 32 entrants and consistent round sizes", () => {
    const res = simulateKnockout(r32, ratings, mulberry32(7));
    const all = new Set(Object.values(r32).flat());
    expect(all.has(res.champion)).toBe(true);
    expect(res.reached.R32.size).toBe(32);
    expect(res.reached.R16.size).toBe(16);
    expect(res.reached.QF.size).toBe(8);
    expect(res.reached.SF.size).toBe(4);
    expect(res.reached.F.size).toBe(2);
    expect(res.finalists).toContain(res.champion);
  });
  it("is deterministic given a seed", () => {
    const a = simulateKnockout(r32, ratings, mulberry32(99)).champion;
    const b = simulateKnockout(r32, ratings, mulberry32(99)).champion;
    expect(a).toBe(b);
  });
  it("a far-stronger field member wins more often", () => {
    const strong = "Aw";
    const rs = Object.fromEntries(Object.values(r32).flat().map((c) => [c, c === strong ? 3000 : 1400]));
    let wins = 0;
    for (let s = 0; s < 200; s++) if (simulateKnockout(r32, rs, mulberry32(s)).champion === strong) wins++;
    expect(wins / 200).toBeGreaterThan(0.4); // dominant team should win a large share
  });
});
