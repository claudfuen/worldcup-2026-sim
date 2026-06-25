// Red-team suite for the fully-decided-group clinch path (lib/sim/clinch.ts `decidedClinch`).
//
// Core idea being tested: once every group game is played, goal difference and goals-for are FINAL, so a
// team separated only by GD/GF IS definitively ahead (the "goals are unbounded" caveat only holds while
// matches remain). The ONLY residual uncertainty is a tie that survives all the way down to conduct /
// FIFA-ranking / drawing of lots — which we treat as NOT clinched.
//
// The heavy lifting is an INDEPENDENT ORACLE: for a decided group the only free variable is how a
// below-goals-for tie resolves, and rankGroup uses ratings purely as that last-resort proxy. So running
// rankGroup under ALL 24 rating permutations and unioning each team's positions yields its exact set of
// achievable finishes — ground truth to check the 2-run decidedClinch against.
import { describe, it, expect } from "vitest";
import { computeClinch, type TeamClinch } from "../lib/sim/clinch";
import { rankGroup } from "../lib/sim/standings";
import { mulberry32 } from "../lib/sim/rng";
import type { GroupMatch, Ratings } from "../lib/sim/types";

const CODES = ["A", "B", "C", "D"];
const PAIRS: [string, string][] = [["A", "B"], ["A", "C"], ["A", "D"], ["B", "C"], ["B", "D"], ["C", "D"]];

const gm = (home: string, away: string, hg: number, ag: number): GroupMatch => ({
  group: "X", home, away, played: true, homeGoals: hg, awayGoals: ag,
});

// All 24 permutations of [0,1,2,3].
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  arr.forEach((x, i) => {
    for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}
const RANK_PERMS = permutations([0, 1, 2, 3]);

// ORACLE: exact achievable finishing positions per team for a DECIDED group, by sweeping every
// rating-tiebreak ordering (ratings are rankGroup's only last-resort, so this realises every lots order).
function achievablePositions(matches: GroupMatch[]): Record<string, Set<number>> {
  const pos: Record<string, Set<number>> = Object.fromEntries(CODES.map((c) => [c, new Set<number>()]));
  for (const perm of RANK_PERMS) {
    const ratings: Ratings = {};
    CODES.forEach((c, i) => (ratings[c] = perm[i]));
    rankGroup(CODES, matches, ratings).forEach((row, i) => pos[row.code].add(i));
  }
  return pos;
}

// The clinch states implied by an achievable-position set (positions are 0-indexed: 0 = 1st).
function oracleClinch(set: Set<number>): TeamClinch {
  const min = Math.min(...set), max = Math.max(...set);
  const top2 = max <= 1;
  return {
    winner: max === 0,
    second: min === 1 && max === 1,
    top2,
    eliminatedTop2: min >= 2,
    eliminatedTop3: min >= 3,
    guaranteedTop3: max <= 2,
  };
}

// Structural invariants every clinch row must satisfy (live OR decided).
function assertRowInvariants(cl: TeamClinch) {
  if (cl.winner) expect(cl.top2).toBe(true);
  if (cl.second) { expect(cl.top2).toBe(true); expect(cl.winner).toBe(false); }
  if (cl.top2) { expect(cl.eliminatedTop2).toBe(false); expect(cl.guaranteedTop3).toBe(true); }
  if (cl.eliminatedTop2) { expect(cl.top2).toBe(false); expect(cl.winner).toBe(false); expect(cl.second).toBe(false); }
  if (cl.eliminatedTop3) { expect(cl.eliminatedTop2).toBe(true); expect(cl.guaranteedTop3).toBe(false); }
  if (cl.guaranteedTop3) expect(cl.eliminatedTop3).toBe(false);
}

function assertGroupInvariants(c: Record<string, TeamClinch>) {
  const rows = Object.values(c);
  rows.forEach(assertRowInvariants);
  expect(rows.filter((r) => r.winner).length).toBeLessThanOrEqual(1);
  expect(rows.filter((r) => r.second).length).toBeLessThanOrEqual(1);
  expect(rows.filter((r) => r.top2).length).toBeLessThanOrEqual(2);
  expect(rows.filter((r) => r.guaranteedTop3).length).toBeLessThanOrEqual(3);
  expect(rows.filter((r) => r.eliminatedTop2).length).toBeLessThanOrEqual(2);
  expect(rows.filter((r) => r.eliminatedTop3).length).toBeLessThanOrEqual(1);
}

const FIELDS: (keyof TeamClinch)[] = ["winner", "second", "top2", "eliminatedTop2", "eliminatedTop3", "guaranteedTop3"];

// ---------------------------------------------------------------------------------------------------
// Hand-crafted boundary scenarios
// ---------------------------------------------------------------------------------------------------

describe("decided group — boundary decided ONLY by overall goal difference", () => {
  it("1st/2nd split by GD: leader clinches the group, runner-up clinches exactly 2nd", () => {
    // A & B both 7 pts, drew 0-0 (level on H2H) -> overall GD decides: A +6, B +2.
    const m = [
      gm("A", "B", 0, 0), gm("A", "C", 3, 0), gm("A", "D", 3, 0),
      gm("B", "C", 1, 0), gm("B", "D", 1, 0), gm("C", "D", 1, 0),
    ];
    const c = computeClinch(CODES, m);
    expect(c.A.winner).toBe(true);
    expect(c.A.second).toBe(false);
    expect(c.B.second).toBe(true);
    expect(c.B.winner).toBe(false);
  });

  it("top-2 cut split by GD: 2nd clinches, 3rd is eliminated from top-2 but still a best-third", () => {
    // A wins (9). B & C both 4, drew 0-0 -> GD decides: B +2 in, C 0 out.
    const m = [
      gm("A", "B", 1, 0), gm("A", "C", 1, 0), gm("A", "D", 1, 0),
      gm("B", "C", 0, 0), gm("B", "D", 3, 0), gm("C", "D", 1, 0),
    ];
    const c = computeClinch(CODES, m);
    expect(c.B.top2).toBe(true);
    expect(c.B.second).toBe(true);
    expect(c.C.top2).toBe(false);
    expect(c.C.eliminatedTop2).toBe(true);
    expect(c.C.guaranteedTop3).toBe(true);
    expect(c.C.eliminatedTop3).toBe(false);
  });

  it("3rd/4th split by GD: 3rd is a guaranteed top-3, 4th is fully eliminated", () => {
    // A 9, B 6, then C & D both 0 pts but C has the better goal difference.
    // A beats all; B beats C & D; C-D drawn? no -> make C & D both lose to A,B and draw each other to tie pts,
    // separated by GD via their results vs the top two.
    const m = [
      gm("A", "B", 1, 0), gm("A", "C", 1, 0), gm("A", "D", 5, 0),
      gm("B", "C", 1, 0), gm("B", "D", 5, 0), gm("C", "D", 0, 0),
    ];
    // C: 0-1,0-1,0-0 -> 1 pt, GF0 GA2 GD-2 ... recompute below via oracle to be safe.
    const c = computeClinch(CODES, m);
    const oracle = achievablePositions(m);
    for (const code of CODES) {
      for (const f of FIELDS) expect(c[code][f], `${code}.${f}`).toBe(oracleClinch(oracle[code])[f]);
    }
  });
});

describe("decided group — 2026 rule: head-to-head applied BEFORE overall goal difference", () => {
  it("a team with WORSE overall GD still clinches the group on the head-to-head win", () => {
    // A & B both 6. A beat B head-to-head 1-0, but A has the worse overall GD (-1 vs +5) because B
    // thrashed C and D while A scraped past them and lost 0-3 to D. 2026 rules rank by H2H first, so A
    // is 1st despite the much worse GD — and the group is over, so it is CLINCHED 1st.
    const m = [
      gm("A", "B", 1, 0), gm("A", "C", 1, 0), gm("D", "A", 3, 0),
      gm("B", "C", 3, 0), gm("B", "D", 3, 0), gm("C", "D", 1, 0),
    ];
    const c = computeClinch(CODES, m);
    // A: 6 pts GD -1 ; B: 6 pts GD +5 ; C: 3 pts (beat D) ; D: 3 pts.
    expect(c.A.winner).toBe(true);
    expect(c.B.second).toBe(true);
    expect(c.C.guaranteedTop3).toBe(true);
    expect(c.C.eliminatedTop2).toBe(true);
    expect(c.D.eliminatedTop3).toBe(true);
    // sanity vs oracle for the whole group
    const oracle = achievablePositions(m);
    for (const code of CODES) for (const f of FIELDS) expect(c[code][f], `${code}.${f}`).toBe(oracleClinch(oracle[code])[f]);
  });

  it("a 3-way points tie resolved by head-to-head goal difference clinches every position", () => {
    // A,B,C each 6 (cycle: A>B, B>C, C>A), all beat D. H2H points level; H2H GD orders them: A +2, C 0, B -2.
    const m = [
      gm("A", "B", 3, 0), gm("B", "C", 1, 0), gm("C", "A", 1, 0),
      gm("A", "D", 1, 0), gm("B", "D", 1, 0), gm("C", "D", 1, 0),
    ];
    const c = computeClinch(CODES, m);
    expect(c.A.winner).toBe(true);
    expect(c.C.second).toBe(true);
    expect(c.B.eliminatedTop2).toBe(true);
    expect(c.B.guaranteedTop3).toBe(true);
    expect(c.D.eliminatedTop3).toBe(true);
  });
});

describe("decided group — ties unresolved except by ranking/lots are NOT clinched", () => {
  it("two teams identical through goals-for: neither clinches 2nd nor is eliminated from top-2", () => {
    // D wins all. A & B identical: 4 pts, drew 0-0, GD 0, GF 1. Only lots separates them.
    const m = [
      gm("A", "B", 0, 0), gm("A", "C", 1, 0), gm("D", "A", 1, 0),
      gm("B", "C", 1, 0), gm("D", "B", 1, 0), gm("D", "C", 1, 0),
    ];
    const c = computeClinch(CODES, m);
    expect(c.D.winner).toBe(true);
    expect(c.A.second).toBe(false);
    expect(c.B.second).toBe(false);
    expect(c.A.top2).toBe(false);
    expect(c.B.top2).toBe(false);
    expect(c.A.eliminatedTop2).toBe(false);
    expect(c.B.eliminatedTop2).toBe(false);
    expect(c.A.guaranteedTop3).toBe(true);
    expect(c.B.guaranteedTop3).toBe(true);
    expect(c.C.eliminatedTop3).toBe(true);
  });

  it("entirely level group (all six 0-0): nothing is clinched, nothing is eliminated", () => {
    const m = PAIRS.map(([h, a]) => gm(h, a, 0, 0));
    const c = computeClinch(CODES, m);
    for (const code of CODES) {
      expect(c[code].winner).toBe(false);
      expect(c[code].top2).toBe(false);
      expect(c[code].second).toBe(false);
      expect(c[code].eliminatedTop2).toBe(false);
      expect(c[code].eliminatedTop3).toBe(false);
      expect(c[code].guaranteedTop3).toBe(false);
    }
  });

  it("two teams tied for 1st (level through GF): both top-2, neither winner nor exactly-2nd", () => {
    // A & B both 7 and identical; C,D far below. Top-2 is locked for both, but 1st-vs-2nd is lots.
    const m = [
      gm("A", "B", 0, 0), gm("A", "C", 2, 0), gm("A", "D", 2, 0),
      gm("B", "C", 2, 0), gm("B", "D", 2, 0), gm("C", "D", 0, 0),
    ];
    const c = computeClinch(CODES, m);
    expect(c.A.top2).toBe(true);
    expect(c.B.top2).toBe(true);
    expect(c.A.winner).toBe(false);
    expect(c.B.winner).toBe(false);
    expect(c.A.second).toBe(false);
    expect(c.B.second).toBe(false);
    expect(c.C.eliminatedTop2).toBe(true);
    expect(c.D.eliminatedTop2).toBe(true);
  });
});

describe("decided group — clean separation by points (regression: still exact)", () => {
  it("A=9 B=6 C=3 D=0 locks every state", () => {
    const m = [
      gm("A", "B", 1, 0), gm("A", "C", 1, 0), gm("A", "D", 1, 0),
      gm("B", "C", 1, 0), gm("B", "D", 1, 0), gm("C", "D", 1, 0),
    ];
    const c = computeClinch(CODES, m);
    expect(c.A.winner).toBe(true);
    expect(c.B.second).toBe(true);
    expect(c.C.eliminatedTop2).toBe(true);
    expect(c.C.guaranteedTop3).toBe(true);
    expect(c.D.eliminatedTop3).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// Property tests: random decided groups vs the independent oracle (the real red-team)
// ---------------------------------------------------------------------------------------------------

function randomDecidedGroup(rand: () => number, maxGoals: number): GroupMatch[] {
  return PAIRS.map(([h, a]) => gm(h, a, Math.floor(rand() * (maxGoals + 1)), Math.floor(rand() * (maxGoals + 1))));
}

describe("decided group — matches the all-permutations oracle over thousands of random groups", () => {
  it("low-scoring groups (0-2 goals) — maximises tie density", () => {
    const rand = mulberry32(20260611);
    for (let n = 0; n < 4000; n++) {
      const m = randomDecidedGroup(rand, 2);
      const c = computeClinch(CODES, m);
      const oracle = achievablePositions(m);
      for (const code of CODES) {
        const exp = oracleClinch(oracle[code]);
        for (const f of FIELDS) {
          expect(c[code][f], `iter ${n} ${code}.${f}\n${JSON.stringify(m.map((x) => [x.home, x.away, x.homeGoals, x.awayGoals]))}`).toBe(exp[f]);
        }
      }
      assertGroupInvariants(c);
    }
  });

  it("higher-scoring groups (0-5 goals) — exercises GD/GF separation paths", () => {
    const rand = mulberry32(987654321);
    for (let n = 0; n < 4000; n++) {
      const m = randomDecidedGroup(rand, 5);
      const c = computeClinch(CODES, m);
      const oracle = achievablePositions(m);
      for (const code of CODES) {
        const exp = oracleClinch(oracle[code]);
        for (const f of FIELDS) {
          expect(c[code][f], `iter ${n} ${code}.${f}\n${JSON.stringify(m.map((x) => [x.home, x.away, x.homeGoals, x.awayGoals]))}`).toBe(exp[f]);
        }
      }
      assertGroupInvariants(c);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Property tests: random PARTIALLY-played groups — invariants on the (unchanged) live enumeration
// ---------------------------------------------------------------------------------------------------

describe("live (partially played) group — structural invariants hold for any result mix", () => {
  it("random number of played matches, random scores", () => {
    const rand = mulberry32(424242);
    for (let n = 0; n < 4000; n++) {
      const m: GroupMatch[] = PAIRS.map(([h, a]) =>
        rand() < 0.5
          ? gm(h, a, Math.floor(rand() * 4), Math.floor(rand() * 4))
          : { group: "X", home: h, away: a, played: false },
      );
      const c = computeClinch(CODES, m);
      assertGroupInvariants(c);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// Soundness bridge: a fully-played group must NEVER produce a result the live enumeration would have
// called impossible. (A decided group is the r=0 special case; clinch must only ADD certainty, never
// contradict the conservative live path on the states it already locks.)
// ---------------------------------------------------------------------------------------------------

describe("decided clinch only strengthens — never contradicts settled positions", () => {
  it("clinched winner/second/eliminations agree with the real final ranking", () => {
    const rand = mulberry32(13371337);
    const ratings: Ratings = { A: 1900, B: 1800, C: 1700, D: 1600 };
    for (let n = 0; n < 3000; n++) {
      const m = randomDecidedGroup(rand, 4);
      const c = computeClinch(CODES, m);
      const order = rankGroup(CODES, m, ratings).map((r) => r.code);
      for (const code of CODES) {
        const pos = order.indexOf(code);
        // A clinched winner must actually sit 1st under the (real-ratings) ranking.
        if (c[code].winner) expect(pos).toBe(0);
        if (c[code].second) expect(pos).toBe(1);
        if (c[code].top2) expect(pos).toBeLessThanOrEqual(1);
        if (c[code].eliminatedTop2) expect(pos).toBeGreaterThanOrEqual(2);
        if (c[code].eliminatedTop3) expect(pos).toBe(3);
        if (c[code].guaranteedTop3) expect(pos).toBeLessThanOrEqual(2);
      }
    }
  });
});
