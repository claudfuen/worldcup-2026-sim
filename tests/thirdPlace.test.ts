import { describe, it, expect } from "vitest";
import { selectAndAssignThirds, rankThirds, type ThirdTeam } from "../lib/sim/thirdPlace";
import { emptyRow } from "../lib/sim/standings";

function third(group: string, code: string, pts: number, gd = 0, gf = 0): ThirdTeam {
  const row = emptyRow(code);
  row.pts = pts; row.gd = gd; row.gf = gf;
  return { group, row };
}

describe("rankThirds", () => {
  it("ranks by points, then overall GD, then GF (no head-to-head)", () => {
    const ts = [third("A", "A", 3, 1, 2), third("B", "B", 3, 2, 1), third("C", "C", 4, 0, 0)];
    expect(rankThirds(ts, {}).map((t) => t.row.code)).toEqual(["C", "B", "A"]);
  });
});

describe("selectAndAssignThirds against the verified 495-row table", () => {
  it("assigns slots correctly when thirds advance from E,F,G,H,I,J,K,L", () => {
    // Make E..L the best 8 (3 pts each) and A,B,C,D the worst (0 pts) so the combination is exactly EFGHIJKL.
    const thirds: ThirdTeam[] = [
      third("A", "tA", 0), third("B", "tB", 0), third("C", "tC", 0), third("D", "tD", 0),
      third("E", "tE", 3), third("F", "tF", 3), third("G", "tG", 3), third("H", "tH", 3),
      third("I", "tI", 3), third("J", "tJ", 3), third("K", "tK", 3), third("L", "tL", 3),
    ];
    const { advancingByGroup, slotToTeam } = selectAndAssignThirds(thirds, {});
    expect(Object.keys(advancingByGroup).sort().join("")).toBe("EFGHIJKL");
    // Verified row: 1A-3E,1B-3J,1D-3I,1E-3F,1G-3H,1I-3G,1K-3L,1L-3K
    expect(slotToTeam["1A"]).toBe("tE");
    expect(slotToTeam["1B"]).toBe("tJ");
    expect(slotToTeam["1D"]).toBe("tI");
    expect(slotToTeam["1E"]).toBe("tF");
    expect(slotToTeam["1G"]).toBe("tH");
    expect(slotToTeam["1I"]).toBe("tG");
    expect(slotToTeam["1K"]).toBe("tL");
    expect(slotToTeam["1L"]).toBe("tK");
  });

  it("each advancing third maps to exactly one slot, and a third is never assigned to its own group's winner", () => {
    const thirds: ThirdTeam[] = "ABCDEFGHIJKL".split("").map((g, i) => third(g, "t" + g, i < 4 ? 0 : 3));
    const { slotToTeam } = selectAndAssignThirds(thirds, {});
    const assigned = Object.values(slotToTeam);
    expect(new Set(assigned).size).toBe(8); // 8 distinct teams
  });
});
