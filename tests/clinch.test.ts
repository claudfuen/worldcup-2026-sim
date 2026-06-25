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

describe("computeClinch — bottom team that can never finish top-3 (Haiti-style)", () => {
  // Group C live: BRA 4(+3), MAR 4(+1), SCO 3, HAI 0(-4). Remaining: SCO-BRA, HAI-MAR.
  // Haiti max 3 pts; BRA/MAR have 4; SCO beat HAI head-to-head -> HAI can never finish top-3.
  // BRA 4, MAR 4, SCO 3, HAI 0; Scotland beat Haiti head-to-head. Remaining: SCO-BRA, HAI-MAR.
  const matches: GroupMatch[] = [
    gm("BRA", "MAR", 1, 1), gm("BRA", "HAI", 1, 0), gm("MAR", "SCO", 1, 0), gm("SCO", "HAI", 1, 0),
    gm("SCO", "BRA"), gm("HAI", "MAR"),
  ];
  const R2 = { BRA: 2208, MAR: 2073, SCO: 1876, HAI: 1691 };
  const c = computeClinch(["BRA", "MAR", "SCO", "HAI"], matches, R2);
  it("flags Haiti as eliminated from top-3 (can never advance)", () => {
    expect(c.HAI.eliminatedTop3).toBe(true);
    expect(c.HAI.eliminatedTop2).toBe(true);
  });
  it("does not over-eliminate the contenders", () => {
    expect(c.BRA.eliminatedTop3).toBe(false);
    expect(c.SCO.eliminatedTop3).toBe(false);
  });
});

describe("computeClinch — winner clinched via head-to-head (Mexico-style)", () => {
  // Group A: MEX 6 (beat RSA, beat KOR 1-0), KOR 3, CZE 1, RSA 1. Remaining: CZE-MEX, RSA-KOR.
  // Only KOR can reach 6; MEX beat KOR head-to-head, so MEX is mathematically 1st even if it loses.
  const matches: GroupMatch[] = [
    gm("MEX", "RSA", 2, 0), gm("KOR", "CZE", 2, 1), gm("CZE", "RSA", 1, 1), gm("MEX", "KOR", 1, 0),
    gm("CZE", "MEX"), gm("RSA", "KOR"),
  ];
  const RA = { MEX: 2050, KOR: 1972, CZE: 1827, RSA: 1734 };
  const c = computeClinch(["MEX", "KOR", "CZE", "RSA"], matches, RA);
  it("flags Mexico as clinched group winner (head-to-head decides the 6-6 tie)", () => {
    expect(c.MEX.winner).toBe(true);
    expect(c.MEX.top2).toBe(true);
  });
  it("does not falsely clinch Korea as winner", () => {
    expect(c.KOR.winner).toBe(false);
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

describe("computeClinch — decided group, 1st/2nd split ONLY by goal difference", () => {
  // All games played. A & B both 7 pts and drew head-to-head 0-0 (level on H2H), so the title is
  // decided by OVERALL goal difference: A +6 beats B +2. Since the group is OVER, that GD is final —
  // A has definitively won the group and B is definitively 2nd (this is the bug: a completed group was
  // still shown as a probability because the enumerator ignored now-settled goal difference).
  const matches: GroupMatch[] = [
    gm("A", "B", 0, 0), gm("A", "C", 3, 0), gm("A", "D", 3, 0),
    gm("B", "C", 1, 0), gm("B", "D", 1, 0), gm("C", "D", 1, 0),
  ];
  const c = computeClinch(["A", "B", "C", "D"], matches, R);
  it("locks A as group winner on settled goal difference", () => {
    expect(c.A.winner).toBe(true);
    expect(c.A.top2).toBe(true);
    expect(c.A.second).toBe(false);
  });
  it("locks B as clinched runner-up (exactly 2nd)", () => {
    expect(c.B.winner).toBe(false);
    expect(c.B.top2).toBe(true);
    expect(c.B.second).toBe(true);
  });
});

describe("computeClinch — decided group, top-2 cut decided ONLY by goal difference", () => {
  // All games played. A wins the group (9). B & C both 4 pts and drew head-to-head 0-0, so the second
  // qualifying spot comes down to overall GD: B +2 is in, C 0 is out. Group is over => B has clinched
  // top-2 and C is mathematically eliminated from top-2 (it can only be a best-third candidate).
  const matches: GroupMatch[] = [
    gm("A", "B", 1, 0), gm("A", "C", 1, 0), gm("A", "D", 1, 0),
    gm("B", "C", 0, 0), gm("B", "D", 3, 0), gm("C", "D", 1, 0),
  ];
  const c = computeClinch(["A", "B", "C", "D"], matches, R);
  it("A wins the group", () => {
    expect(c.A.winner).toBe(true);
  });
  it("B has clinched top-2 (2nd) on settled goal difference", () => {
    expect(c.B.top2).toBe(true);
    expect(c.B.second).toBe(true);
    expect(c.B.eliminatedTop2).toBe(false);
  });
  it("C is out of top-2 but still a guaranteed top-3 (best-third candidate)", () => {
    expect(c.C.top2).toBe(false);
    expect(c.C.eliminatedTop2).toBe(true);
    expect(c.C.guaranteedTop3).toBe(true);
    expect(c.C.eliminatedTop3).toBe(false);
  });
  it("D is fully eliminated", () => {
    expect(c.D.eliminatedTop2).toBe(true);
    expect(c.D.eliminatedTop3).toBe(true);
  });
});

describe("computeClinch — decided group, a tie unresolved except by ranking/lots stays unclinched", () => {
  // All games played. D wins all (9, 1st). A & B are IDENTICAL through every settled criterion: both 4
  // pts, drew head-to-head 0-0, both overall GD 0 and GF 1. Only conduct / FIFA ranking / drawing of
  // lots can separate them — none a real settled criterion here — so NEITHER has clinched 2nd, and
  // neither is eliminated from top-2. Both ARE guaranteed top-3 (C is certainly last).
  const matches: GroupMatch[] = [
    gm("A", "B", 0, 0), gm("A", "C", 1, 0), gm("D", "A", 1, 0),
    gm("B", "C", 1, 0), gm("D", "B", 1, 0), gm("D", "C", 1, 0),
  ];
  const c = computeClinch(["A", "B", "C", "D"], matches, R);
  it("D has clinched the group", () => {
    expect(c.D.winner).toBe(true);
  });
  it("neither A nor B is clinched 2nd nor eliminated from top-2 (only lots separates them)", () => {
    expect(c.A.second).toBe(false);
    expect(c.B.second).toBe(false);
    expect(c.A.top2).toBe(false);
    expect(c.B.top2).toBe(false);
    expect(c.A.eliminatedTop2).toBe(false);
    expect(c.B.eliminatedTop2).toBe(false);
  });
  it("both A and B are guaranteed top-3; C is certainly last", () => {
    expect(c.A.guaranteedTop3).toBe(true);
    expect(c.B.guaranteedTop3).toBe(true);
    expect(c.C.eliminatedTop3).toBe(true);
  });
});

describe("computeClinch — no false winner-clinch via overall GD (unbounded-goals soundness)", () => {
  // Z 7(+10), Y 4, X 0, W 0. Played: Z-Y 4-4 draw, Z-X 5-0, Z-W 5-0, Y-W 1-0. Remaining: Y-X, X-W.
  // Y can reach 7 by beating X; the Z-Y head-to-head was a 4-4 draw (level on H2H points), so a big
  // enough Y win flips the OVERALL goal-difference tiebreak and dethrones Z. Z therefore has NOT
  // clinched the group (a goal-cap brute force missed the >cap blowout and wrongly flagged Z winner),
  // but Z HAS clinched top-2 (it can fall no lower than 2nd in any scenario).
  const matches: GroupMatch[] = [
    gm("Z", "Y", 4, 4), gm("Z", "X", 5, 0), gm("Z", "W", 5, 0), gm("Y", "W", 1, 0),
    gm("Y", "X"), gm("X", "W"),
  ];
  const RZ = { Z: 1900, Y: 1850, X: 1700, W: 1650 };
  const c = computeClinch(["Z", "Y", "X", "W"], matches, RZ);
  it("does NOT falsely clinch Z as group winner (overall GD can be overturned by goals)", () => {
    expect(c.Z.winner).toBe(false);
  });
  it("still clinches Z for top-2 (guaranteed no worse than 2nd)", () => {
    expect(c.Z.top2).toBe(true);
    expect(c.Z.second).toBe(false); // can still be 1st, so not clinched *exactly* 2nd
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
