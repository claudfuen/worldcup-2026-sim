// Regression test for the cross-group "best third" advancement clinch in lib/groupView.ts.
//
// A third-placed team reaches the Round of 32 iff it is one of the 8 best of the 12 thirds — i.e. at most
// 7 OTHER groups can field a third ranked above it. While a group is still playing, goals are unbounded, so
// any third that can MATCH this team's points could overtake it on goals (count by points, `>=`). But once
// two groups are BOTH fully played, GD/GF are settled: a decided third tied on points yet behind on GD/GF
// can no longer overtake, so it must NOT be counted against this team.
//
// The bug this guards: counting decided groups by points alone over-counted ties, hiding genuine clinches.
// It mirrors the real 2026 group stage (Sweden/Ecuador/Bosnia clinched as best-thirds while tied on points
// with other decided thirds; Paraguay, one place worse on the settled tiebreak, did not).
import { describe, it, expect } from "vitest";
import { buildGroupViews } from "../lib/groupView";
import type { GroupMatch } from "../lib/sim/types";
import { GROUPS, TEAMS } from "../lib/data/teams";

const codesOf = (g: string) => TEAMS.filter((t) => t.group === g).map((t) => t.code);
// Canonical 4-team round-robin order; the last two entries are the "final matchday" (each team plays once),
// so passing null there leaves a group with exactly two matches still to play.
const PAIRS: [number, number][] = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]]; // A-B,C-D,A-C,B-D,A-D,B-C
const mk = (g: string, sc: ([number, number] | null)[]): GroupMatch[] => {
  const c = codesOf(g);
  return PAIRS.map((p, i) => {
    const s = sc[i];
    const base = { group: g, home: c[p[0]], away: c[p[1]] };
    return (s ? { ...base, played: true, homeGoals: s[0], awayGoals: s[1] } : { ...base, played: false }) as GroupMatch;
  });
};
// DECIDED group, final standings 1st=7+ / 2nd=6 / 3rd=4pts / 4th=0; the 3rd's GD is (m - n), GF is m.
const dec4 = (g: string, m: number, n: number) => mk(g, [[0, 0], [1, 0], [1, 0], [m, 0], [1, 0], [0, n]]);
// DECIDED group whose 3rd finishes on 3 pts (clearly below the 4-pt thirds).
const dec3 = (g: string) => mk(g, [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 1]]);
// UNDECIDED group: 4 played (all four level on 3 pts), 2 to play; its eventual 3rd can still reach 4 pts.
const und = (g: string) => mk(g, [[2, 1], [0, 1], [0, 1], [1, 0], null, null]);

const ratings = Object.fromEntries(TEAMS.map((t) => [t.code, 1500]));
const statusOfThird = (gm: Record<string, GroupMatch[]>) => {
  const { groups } = buildGroupViews(gm, ratings, () => ({ winGroup: 0, advance: 0 }));
  return Object.fromEntries(groups.map((gv) => [gv.group, gv.teams[2].status]));
};

describe("buildGroupViews — best-third clinch respects settled GD/GF tiebreakers", () => {
  // 4 decided groups with thirds tied on 4 pts (GD +2/+1/0/-1), 5 undecided groups whose third can reach 4,
  // and 3 decided groups with 3-pt thirds. Counting by points alone, the top 4-pt thirds each see 3 tied
  // decided + 5 undecided = 8 rivals at >=4 (> 7) and look unclinched. Settled tiebreakers drop the decided
  // thirds that are actually BELOW them, revealing the real clinches.
  const gm: Record<string, GroupMatch[]> = {};
  gm["A"] = dec4("A", 3, 1); // 4 pts, GD +2  (best of the tied thirds)
  gm["B"] = dec4("B", 2, 1); // 4 pts, GD +1
  gm["C"] = dec4("C", 1, 1); // 4 pts, GD  0
  gm["D"] = dec4("D", 1, 2); // 4 pts, GD -1  (one place worse — the boundary, like Paraguay)
  for (const g of ["E", "F", "G", "H", "I"]) gm[g] = und(g);
  for (const g of ["J", "K", "L"]) gm[g] = dec3(g);
  const status = statusOfThird(gm);

  it("clinches the decided 4-pt thirds that win the settled tiebreak (worst-case ranks 6-8)", () => {
    expect(status["A"]).toBe("advanced");
    expect(status["B"]).toBe("advanced");
    expect(status["C"]).toBe("advanced");
  });

  it("does NOT clinch the next 4-pt third, which can still be pushed to 9th", () => {
    expect(status["D"]).toBe("live");
  });

  it("leaves still-playing groups and the lower decided thirds as live (no false clinch)", () => {
    for (const g of ["E", "F", "G", "H", "I", "J", "K", "L"]) expect(status[g]).toBe("live");
  });

  it("never marks more than 8 thirds as through (a top-8 invariant)", () => {
    const through = GROUPS.filter((g) => ["won_group", "second", "advanced"].includes(status[g]));
    expect(through.length).toBeLessThanOrEqual(8);
  });
});

describe("buildGroupViews — best-third ELIMINATION respects settled GD/GF tiebreakers", () => {
  // The mirror of the clinch case. All 12 groups decided. The target third (group A) ties EIGHT other
  // decided thirds on points but trails them all on goal difference, so those 8 are mathematically above it
  // — it can finish no better than 9th of 12 thirds and is out. Counting by points alone (the old bug) sees
  // no group "strictly above" on points and wrongly leaves it alive.
  const T3_GDm5 = [[0, 0], [1, 0], [3, 0], [1, 0], [1, 0], [3, 0]] as [number, number][]; // 3rd: 3 pts, GD -5
  const T3_GD0 = [[0, 0], [2, 0], [1, 0], [1, 0], [1, 0], [1, 0]] as [number, number][]; //  3rd: 3 pts, GD  0
  const T1 = [[0, 0], [1, 1], [1, 0], [1, 0], [1, 0], [1, 0]] as [number, number][]; //      3rd: 1 pt (below)

  const gm: Record<string, GroupMatch[]> = {};
  gm["A"] = mk("A", T3_GDm5); // target
  for (const g of ["B", "C", "D", "E", "F", "G", "H", "I"]) gm[g] = mk(g, T3_GD0); // 8 thirds tied on pts, better GD
  for (const g of ["J", "K", "L"]) gm[g] = mk(g, T1); // 3 thirds below on points
  const status = statusOfThird(gm);

  it("eliminates a decided 3rd that 8 decided groups outrank on GD despite equal points", () => {
    expect(status["A"]).toBe("eliminated"); // points-only would leave it "live" (none have strictly more points)
  });

  it("keeps the eight better thirds advancing (they are the top 8)", () => {
    for (const g of ["B", "C", "D", "E", "F", "G", "H", "I"]) expect(status[g]).toBe("advanced");
  });
});
