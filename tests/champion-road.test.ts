import { describe, it, expect } from "vitest";
import { applyChampionRoad } from "../lib/championRoad";
import type { MatchInfo, SlotCandidate } from "../lib/predictions";

const cand = (code: string, prob: number): SlotCandidate => ({ code, name: code, prob });

const ko = (match: number, round: string, over: Partial<MatchInfo> = {}): MatchInfo => ({
  match, round, utc: "2026-07-19T19:00Z", venue: "V", city: "C",
  home: null, away: null, homeName: null, awayName: null, defined: false, status: "scheduled",
  ...over,
});

// Minimal top half of the tree: SF1 (101) feeds the final's home slot, SF2 (102) the away slot.
const tree = () => [
  ko(101, "SF", { slotHome: "W97", slotAway: "W98", projHome: [cand("ESP", 0.6), cand("MAR", 0.4)], projAway: [cand("FRA", 0.7), cand("GER", 0.3)] }),
  ko(102, "SF", { slotHome: "W99", slotAway: "W100", projHome: [cand("ARG", 0.55), cand("BRA", 0.45)], projAway: [cand("ENG", 0.5), cand("POR", 0.5)] }),
  ko(97, "QF", { slotHome: "W89", slotAway: "W90", projHome: [cand("MAR", 0.5), cand("ESP", 0.45)], projAway: [cand("USA", 0.6), cand("JPN", 0.4)] }),
  ko(104, "FINAL", {
    slotHome: "W101", slotAway: "W102",
    projHome: [cand("FRA", 0.39), cand("ESP", 0.37), cand("MAR", 0.07)],
    projAway: [cand("ARG", 0.4), cand("BRA", 0.21), cand("ENG", 0.13)],
  }),
];

describe("applyChampionRoad", () => {
  it("re-fronts the champion in the final slot it most likely occupies, leaving probs untouched", () => {
    const matches = tree();
    applyChampionRoad(matches, "ESP");
    const final = matches.find((m) => m.match === 104)!;
    expect(final.projHome!.map((c) => c.code)).toEqual(["ESP", "FRA", "MAR"]);
    expect(final.projHome!.map((c) => c.prob)).toEqual([0.37, 0.39, 0.07]);
    // the other half of the draw is not the champion's road — untouched
    expect(final.projAway!.map((c) => c.code)).toEqual(["ARG", "BRA", "ENG"]);
  });

  it("walks the W## feeder chain down the champion's side", () => {
    const matches = tree();
    applyChampionRoad(matches, "ESP");
    // SF1 home (ESP 0.6) already led — order preserved; QF 97 home slot gets ESP re-fronted over MAR
    expect(matches.find((m) => m.match === 101)!.projHome!.map((c) => c.code)).toEqual(["ESP", "MAR"]);
    expect(matches.find((m) => m.match === 97)!.projHome!.map((c) => c.code)).toEqual(["ESP", "MAR"]);
    // QF 97's away slot feeds the OTHER semifinalist — not on the road
    expect(matches.find((m) => m.match === 97)!.projAway![0].code).toBe("USA");
  });

  it("follows the bottom half when the champion's reach prob is higher there", () => {
    const matches = tree();
    applyChampionRoad(matches, "BRA");
    const final = matches.find((m) => m.match === 104)!;
    expect(final.projAway!.map((c) => c.code)).toEqual(["BRA", "ARG", "ENG"]);
    expect(final.projHome![0].code).toBe("FRA"); // top half untouched
    expect(matches.find((m) => m.match === 102)!.projHome!.map((c) => c.code)).toEqual(["BRA", "ARG"]);
  });

  it("passes through a slot already resolved to the champion and keeps descending", () => {
    const matches = tree();
    const final = matches.find((m) => m.match === 104)!;
    final.home = "ESP"; final.homeName = "Spain"; final.projHome = undefined; // SF played: ESP is IN the final
    applyChampionRoad(matches, "ESP");
    // still descends into SF1 and QF97 (harmless on resolved history, required pre-play)
    expect(matches.find((m) => m.match === 97)!.projHome![0].code).toBe("ESP");
  });

  it("stops at a played match — history is never re-narrated", () => {
    const matches = tree();
    const final = matches.find((m) => m.match === 104)!;
    final.home = "ESP"; final.away = "ARG"; final.status = "final"; final.winner = "ESP";
    const before = JSON.stringify(matches.find((m) => m.match === 97));
    applyChampionRoad(matches, "ESP");
    expect(JSON.stringify(matches.find((m) => m.match === 97))).toBe(before);
  });

  it("is a no-op when the champion appears in neither slot of the final", () => {
    const matches = tree();
    const before = JSON.stringify(matches);
    applyChampionRoad(matches, "QAT");
    expect(JSON.stringify(matches)).toBe(before);
  });

  it("is a no-op without a champion or a final", () => {
    const matches = tree();
    const before = JSON.stringify(matches);
    applyChampionRoad(matches, undefined);
    expect(JSON.stringify(matches)).toBe(before);
    applyChampionRoad([ko(89, "R16")], "ESP"); // no FINAL in the list — must not throw
  });
});
