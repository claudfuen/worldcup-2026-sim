import { describe, it, expect } from "vitest";
import { computeClinch } from "../lib/sim/clinch";
import type { GroupMatch } from "../lib/sim/types";

const R = { CAN: 1979, SUI: 2036, BIH: 1599, QAT: 1615, A: 1900, B: 1800, C: 1700, D: 1600 };
const gm = (home: string, away: string, hg?: number, ag?: number): GroupMatch =>
  hg == null ? { group: "X", home, away, played: false } : { group: "X", home, away, played: true, homeGoals: hg, awayGoals: ag };

describe("computeClinch — real Group B (the Canada/Switzerland red-team case)", () => {
  // CAN 4(+6), SUI 4(+3), BIH 1(-3), QAT 1(-6); remaining BIH-QAT and SUI-CAN.
  const matches: GroupMatch[] = [
    gm("CAN", "BIH", 1, 1), gm("QAT", "SUI", 1, 1), gm("SUI", "BIH", 4, 1), gm("CAN", "QAT", 6, 0),
    gm("BIH", "QAT"), gm("SUI", "CAN"),
  ];
  const c = computeClinch(["CAN", "SUI", "BIH", "QAT"], matches, R);

  it("neither Canada nor Switzerland is mathematically clinched for top 2", () => {
    expect(c.CAN.top2).toBe(false);
    expect(c.SUI.top2).toBe(false);
  });
  it("no team is mathematically eliminated yet (Bosnia/Qatar can still sneak top 2)", () => {
    expect(c.BIH.eliminatedTop2).toBe(false);
    expect(c.QAT.eliminatedTop2).toBe(false);
  });
  it("nobody has clinched winning the group", () => {
    expect(Object.values(c).every((x) => x.winner === false)).toBe(true);
  });
});

describe("computeClinch — fully decided group", () => {
  // Round robin: A beats all, B beats C&D, C beats D. A=9 B=6 C=3 D=0.
  const matches: GroupMatch[] = [
    gm("A", "B", 1, 0), gm("A", "C", 1, 0), gm("A", "D", 1, 0),
    gm("B", "C", 1, 0), gm("B", "D", 1, 0), gm("C", "D", 1, 0),
  ];
  const c = computeClinch(["A", "B", "C", "D"], matches, R);
  it("locks winner, top-2 and eliminations", () => {
    expect(c.A.winner).toBe(true);
    expect(c.A.top2).toBe(true);
    expect(c.B.top2).toBe(true);
    expect(c.C.top2).toBe(false);
    expect(c.C.eliminatedTop2).toBe(true);
    expect(c.D.eliminatedTop2).toBe(true);
  });
});

describe("computeClinch — winner clinched with a match to spare", () => {
  // A has 6 pts (beat B, beat C); D pointless; remaining C-D and A-... actually A done. B max 4, C max 4, D max 3.
  const matches: GroupMatch[] = [
    gm("A", "B", 2, 0), gm("A", "C", 2, 0), gm("A", "D", 2, 0), // A = 9, done
    gm("B", "C", 0, 0), gm("B", "D", 0, 0), // B has 2
    gm("C", "D"), // remaining
  ];
  const c = computeClinch(["A", "B", "C", "D"], matches, R);
  it("A has clinched the group (no one can catch 9)", () => {
    expect(c.A.winner).toBe(true);
    expect(c.A.top2).toBe(true);
  });
});
