// Mathematical clinching (NOT simulation probability). A team is only "clinched" if it is guaranteed
// the outcome across EVERY possible remaining result, under the real 2026 FIFA tiebreakers.
//
// Goals are UNBOUNDED under the rules, so any separation that comes down to overall goal difference or
// goals-for can always be flipped by a large-enough scoreline. The only goal-INDEPENDENT criteria are
// (1) match points and (2) head-to-head points (recursively, among the teams tied on points). So we
// enumerate only the win/draw/loss outcomes of the remaining matches (3^r) and, within each, separate
// teams solely by points then recursive H2H points. Any pair left tied after that is treated as
// "could go either way" (a blowout could decide it) — i.e. NOT a safe clinch. This is both sound and
// far cheaper than a goal grid, and it never over-claims certainty.
import type { GroupMatch, Ratings } from "./types";
import { rankGroup } from "./standings";

export interface TeamClinch {
  winner: boolean; // clinched 1st
  second: boolean; // clinched exactly 2nd (guaranteed top-2 and can no longer finish 1st)
  top2: boolean; // clinched top-2 (position may still be open)
  eliminatedTop2: boolean;
  eliminatedTop3: boolean; // can never finish top-3 (always 4th) => can never advance, even as a best-third
  guaranteedTop3: boolean;
}
export type GroupClinch = Record<string, TeamClinch>;

type Outcome = "H" | "D" | "A"; // home win / draw / away win
interface MatchOutcome { home: string; away: string; o: Outcome }

function playedOutcome(m: GroupMatch): Outcome {
  const h = m.homeGoals as number, a = m.awayGoals as number;
  return h > a ? "H" : h < a ? "A" : "D";
}

// Worst-case (minimum) points the eventual 3rd-placed team of a group can finish with, over all
// remaining W/D/L outcomes. Used as a sound bound for cross-group best-third elimination.
export function minThirdPlacePoints(codes: string[], matches: GroupMatch[]): number {
  const base: Record<string, number> = {};
  for (const c of codes) base[c] = 0;
  for (const m of matches) {
    if (!m.played || m.homeGoals == null || m.awayGoals == null) continue;
    if (m.homeGoals > m.awayGoals) base[m.home] += 3;
    else if (m.homeGoals < m.awayGoals) base[m.away] += 3;
    else { base[m.home] += 1; base[m.away] += 1; }
  }
  const remaining = matches.filter((m) => !m.played);
  let min = Infinity;
  const rec = (i: number, pts: Record<string, number>) => {
    if (i === remaining.length) {
      const sorted = codes.map((c) => pts[c]).sort((a, b) => b - a);
      min = Math.min(min, sorted[2]); // 3rd-highest points
      return;
    }
    const m = remaining[i];
    for (const o of [0, 1, 2]) {
      const p = { ...pts };
      if (o === 0) p[m.home] += 3;
      else if (o === 1) { p[m.home] += 1; p[m.away] += 1; }
      else p[m.away] += 3;
      rec(i + 1, p);
    }
  };
  rec(0, base);
  return min === Infinity ? 0 : min;
}

// Best-case (maximum) points the eventual 3rd-placed team of a group can finish with.
export function maxThirdPlacePoints(codes: string[], matches: GroupMatch[]): number {
  const base: Record<string, number> = {};
  for (const c of codes) base[c] = 0;
  for (const m of matches) {
    if (!m.played || m.homeGoals == null || m.awayGoals == null) continue;
    if (m.homeGoals > m.awayGoals) base[m.home] += 3;
    else if (m.homeGoals < m.awayGoals) base[m.away] += 3;
    else { base[m.home] += 1; base[m.away] += 1; }
  }
  const remaining = matches.filter((m) => !m.played);
  let max = -Infinity;
  const rec = (i: number, pts: Record<string, number>) => {
    if (i === remaining.length) {
      const sorted = codes.map((c) => pts[c]).sort((a, b) => b - a);
      max = Math.max(max, sorted[2]);
      return;
    }
    const m = remaining[i];
    for (const o of [0, 1, 2]) {
      const p = { ...pts };
      if (o === 0) p[m.home] += 3;
      else if (o === 1) { p[m.home] += 1; p[m.away] += 1; }
      else p[m.away] += 3;
      rec(i + 1, p);
    }
  };
  rec(0, base);
  return max === -Infinity ? 0 : max;
}

// Max points a team can still reach (sound upper bound on its best-case finish).
export function maxReachablePoints(code: string, matches: GroupMatch[]): number {
  let pts = 0, remaining = 0;
  for (const m of matches) {
    const involved = m.home === code || m.away === code;
    if (m.played && m.homeGoals != null && m.awayGoals != null) {
      if (m.homeGoals === m.awayGoals) { if (involved) pts += 1; }
      else if ((m.homeGoals > m.awayGoals ? m.home : m.away) === code) pts += 3;
    } else if (!m.played && involved) remaining += 1;
  }
  return pts + 3 * remaining;
}

// Points a team earns from matches played *only between members of `group`*, for a given set of outcomes.
function h2hPoints(code: string, group: Set<string>, out: MatchOutcome[]): number {
  let p = 0;
  for (const x of out) {
    if (!group.has(x.home) || !group.has(x.away)) continue;
    if (x.home === code) { if (x.o === "H") p += 3; else if (x.o === "D") p += 1; }
    else if (x.away === code) { if (x.o === "A") p += 3; else if (x.o === "D") p += 1; }
  }
  return p;
}

// Split a set of teams (already tied on overall points) into ordered tiers using ONLY recursive
// head-to-head points. Teams in the same returned tier are indistinguishable by goal-independent
// criteria (their order would be decided by goals), so they are mutually "ambiguous".
function h2hTiers(group: string[], out: MatchOutcome[]): string[][] {
  if (group.length <= 1) return [group];
  const set = new Set(group);
  const pts = new Map(group.map((c) => [c, h2hPoints(c, set, out)]));
  const distinct = [...new Set(group.map((c) => pts.get(c)!))].sort((a, b) => b - a);
  if (distinct.length === 1) return [group]; // all level on H2H points => ambiguous from here on
  const tiers: string[][] = [];
  for (const v of distinct) {
    const sub = group.filter((c) => pts.get(c) === v);
    tiers.push(...h2hTiers(sub, out)); // re-apply criteria within the still-tied subset
  }
  return tiers;
}

// Goal-independent tier rank for every team in one full set of outcomes: lower index = strictly higher.
// Teams sharing a tier are ambiguous (a scoreline could order them either way).
function tierRank(codes: string[], out: MatchOutcome[]): Map<string, { tier: number; tierSize: number }> {
  const pts: Record<string, number> = {};
  for (const c of codes) pts[c] = 0;
  for (const x of out) {
    if (x.o === "H") pts[x.home] += 3;
    else if (x.o === "A") pts[x.away] += 3;
    else { pts[x.home] += 1; pts[x.away] += 1; }
  }
  const byPoints = [...new Set(codes.map((c) => pts[c]))].sort((a, b) => b - a);
  const tiers: string[][] = [];
  for (const v of byPoints) {
    const grp = codes.filter((c) => pts[c] === v);
    tiers.push(...h2hTiers(grp, out));
  }
  const rank = new Map<string, { tier: number; tierSize: number }>();
  tiers.forEach((t, i) => t.forEach((c) => rank.set(c, { tier: i, tierSize: t.length })));
  return rank;
}

// Once a group has played all its games, goal difference and goals-for are FINAL and settled — there
// are no more goals to score — so a team separated only by GD/GF IS definitively ahead. The unbounded-
// goals argument above only applies WHILE matches remain. Here we therefore use the real 2026
// tiebreakers (rankGroup, incl. GD/GF). The only residual uncertainty is a tie that survives all the
// way down to conduct / FIFA-ranking / drawing of lots; those are not real settled criteria here, so
// (consistent with the rest of this module) we treat such a pair as NOT clinched.
//
// We detect "separated by a settled criterion" by ranking the group twice with opposite final-tiebreak
// proxies: identical synthetic ratings, negated. Points/H2H/GD/GF decide identically in both runs; a
// pair separable ONLY by the proxy flips between them. So one team is *certainly* above another iff it
// ranks above in BOTH runs.
function decidedClinch(codes: string[], matches: GroupMatch[]): GroupClinch {
  const up: Ratings = {};
  const down: Ratings = {};
  codes.forEach((c, i) => { up[c] = i; down[c] = -i; });
  const a = rankGroup(codes, matches, up).map((row) => row.code);
  const b = rankGroup(codes, matches, down).map((row) => row.code);
  const posA = new Map(a.map((c, i) => [c, i]));
  const posB = new Map(b.map((c, i) => [c, i]));

  const out: GroupClinch = {};
  for (const c of codes) {
    const certainlyAbove = codes.filter(
      (o) => o !== c && posA.get(o)! < posA.get(c)! && posB.get(o)! < posB.get(c)!,
    ).length;
    const possiblyAbove = codes.filter(
      (o) => o !== c && (posA.get(o)! < posA.get(c)! || posB.get(o)! < posB.get(c)!),
    ).length;
    const bestRank = certainlyAbove + 1; // nobody uncertain pushed above c
    const worstRank = possiblyAbove + 1; // everyone who could be above c, is
    const top2 = worstRank <= 2;
    out[c] = {
      winner: worstRank === 1, // certainly 1st: no team is ever above it
      second: top2 && bestRank >= 2, // guaranteed top-2 and at least one team certainly above => exactly 2nd
      top2,
      eliminatedTop2: bestRank > 2,
      eliminatedTop3: bestRank > 3,
      guaranteedTop3: worstRank <= 3,
    };
  }
  return out;
}

// `ratings` is accepted for signature compatibility but is intentionally unused: while matches remain,
// clinching is decided purely by points and head-to-head points, never by the FIFA-ranking fallback
// (which is goal/ranking dependent and would itself never produce a guaranteed result here). Once the
// group is fully played, GD/GF are settled and decidedClinch (above) resolves it via the real
// tiebreakers — still without the ranking proxy, so ratings stay unused.
export function computeClinch(codes: string[], matches: GroupMatch[], _ratings?: Ratings): GroupClinch {
  const played = matches.filter((m) => m.played);
  const remaining = matches.filter((m) => !m.played);
  const r = remaining.length;
  if (r === 0) return decidedClinch(codes, matches); // all games played: GD/GF are final, not ambiguous

  const canWin = new Set<string>(), canNotWin = new Set<string>();
  const canTop2 = new Set<string>(), canMiss = new Set<string>();
  const canTop3 = new Set<string>(), canBe4th = new Set<string>();

  const playedOut: MatchOutcome[] = played.map((m) => ({ home: m.home, away: m.away, o: playedOutcome(m) }));

  const combo: Outcome[] = [];
  const evaluate = () => {
    const out: MatchOutcome[] = playedOut.concat(
      remaining.map((m, i) => ({ home: m.home, away: m.away, o: combo[i] })),
    );
    const rank = tierRank(codes, out);
    for (const c of codes) {
      const { tier, tierSize } = rank.get(c)!;
      const mustAbove = [...rank.values()].filter((v) => v.tier < tier).length;
      const bestRank = mustAbove + 1;          // tiermates and below pushed under c by favourable goals
      const worstRank = mustAbove + tierSize;  // c falls to the bottom of its own ambiguity tier
      if (bestRank === 1) canWin.add(c);
      if (worstRank > 1) canNotWin.add(c);
      if (bestRank <= 2) canTop2.add(c);
      if (worstRank > 2) canMiss.add(c);
      if (bestRank <= 3) canTop3.add(c);
      if (worstRank >= 4) canBe4th.add(c);
    }
  };
  const rec = (i: number) => {
    if (i === r) { evaluate(); return; }
    for (const o of ["H", "D", "A"] as Outcome[]) { combo[i] = o; rec(i + 1); }
    combo.length = i;
  };
  rec(0);

  const out: GroupClinch = {};
  for (const c of codes) {
    const top2 = canTop2.has(c) && !canMiss.has(c);
    out[c] = {
      winner: canWin.has(c) && !canNotWin.has(c),
      second: top2 && !canWin.has(c), // guaranteed top-2 and can never finish 1st => clinched exactly 2nd
      top2,
      eliminatedTop2: !canTop2.has(c),
      eliminatedTop3: !canTop3.has(c),
      guaranteedTop3: !canBe4th.has(c),
    };
  }
  return out;
}
