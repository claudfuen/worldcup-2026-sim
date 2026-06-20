import { describe, it, expect } from "vitest";
import { rankGroup, computeRows } from "../lib/sim/standings";
import type { GroupMatch } from "../lib/sim/types";

const m = (home: string, away: string, hg: number, ag: number): GroupMatch => ({
  group: "X", home, away, played: true, homeGoals: hg, awayGoals: ag,
});
// Equal ratings so the Elo/FIFA-ranking proxy never silently decides ties we want H2H/GD to decide.
const R = { A: 1500, B: 1500, C: 1500, D: 1500 };

describe("computeRows", () => {
  it("tallies points, gd, gf correctly", () => {
    const rows = computeRows(["A", "B"], [m("A", "B", 2, 1)]);
    expect(rows.A.pts).toBe(3);
    expect(rows.A.gd).toBe(1);
    expect(rows.B.pts).toBe(0);
    expect(rows.B.gd).toBe(-1);
  });
});

describe("2026 tiebreakers — head-to-head BEFORE overall goal difference (the rule change)", () => {
  it("ranks the H2H winner above a team with far better overall GD", () => {
    // A & B tied on 6 pts. A beat B head-to-head. B has +9 GD (thrashed C,D); A only +1 GD.
    // 2022 rules => B first (overall GD). 2026 rules => A first (won H2H). We assert 2026.
    const matches = [
      m("A", "B", 1, 0), // A beats B (H2H)
      m("A", "D", 1, 0),
      m("C", "A", 1, 0), // A's only loss
      m("B", "C", 5, 0),
      m("B", "D", 5, 0),
      m("D", "C", 1, 0),
    ];
    const order = rankGroup(["A", "B", "C", "D"], matches, R).map((r) => r.code);
    expect(order.slice(0, 2)).toEqual(["A", "B"]);
    // and the 3-pt pair C/D split by their head-to-head (D beat C)
    expect(order.slice(2)).toEqual(["D", "C"]);
  });

  it("falls back to overall GD when the H2H match was drawn", () => {
    // A & B tied on points and drew head-to-head; A has better overall GD => A first.
    const matches = [
      m("A", "B", 1, 1), // drawn H2H
      m("A", "C", 3, 0),
      m("A", "D", 0, 1),
      m("B", "C", 1, 0),
      m("B", "D", 0, 1),
      m("C", "D", 0, 0),
    ];
    const rows = Object.fromEntries(rankGroup(["A", "B", "C", "D"], matches, R).map((r) => [r.code, r]));
    // A: D1(B) W1(C 3-0) L1(D) = 4pts gd +1 ; B: D1(A) W1(C) L1(D)=4pts gd -? compute
    expect(rows.A.pts).toBe(rows.B.pts);
    const order = rankGroup(["A", "B", "C", "D"], matches, R).map((r) => r.code);
    expect(order.indexOf("A")).toBeLessThan(order.indexOf("B")); // A better overall GD
  });
});

describe("three-way tie handling", () => {
  it("when the H2H mini-table makes no progress (cycle), falls to overall GD", () => {
    // A,B,C each beat D and form a 1-0 cycle among themselves => equal H2H pts (3) AND equal H2H GD (0).
    // H2H cannot separate them -> overall GD decides (their margins vs D differ).
    const matches = [
      m("A", "B", 1, 0),
      m("B", "C", 1, 0),
      m("C", "A", 1, 0),
      m("A", "D", 5, 0), // A best overall GD
      m("B", "D", 3, 0),
      m("C", "D", 1, 0),
    ];
    const order = rankGroup(["A", "B", "C", "D"], matches, R).map((r) => r.code);
    expect(order).toEqual(["A", "B", "C", "D"]);
  });

  it("fully separates a 3-way tie using H2H mini-table GD then GF (not overall)", () => {
    // A,B,C all 6 pts (each also beat D 1-0). Cycle on H2H points (3 each) but mini-table GD/GF differ:
    //   A beat B 3-0, B beat C 2-0, C beat A 1-0.
    //   mini GD: A +2, B -1, C -1 ; mini GF among B,C: B 2 > C 1 => order A,B,C — decided purely by H2H.
    const matches = [
      m("A", "B", 3, 0),
      m("B", "C", 2, 0),
      m("C", "A", 1, 0),
      m("A", "D", 1, 0),
      m("B", "D", 1, 0),
      m("C", "D", 1, 0),
    ];
    const order = rankGroup(["A", "B", "C", "D"], matches, R).map((r) => r.code);
    expect(order).toEqual(["A", "B", "C", "D"]);
  });
});
