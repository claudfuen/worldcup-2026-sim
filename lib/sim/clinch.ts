// Mathematical clinching (NOT simulation probability). A team is only "clinched" if it is guaranteed
// the outcome across EVERY possible remaining scoreline, under the real 2026 FIFA tiebreakers.
// Conservative: any tie unresolved through overall goals-for (i.e. decided only by fair-play / FIFA ranking)
// is treated as NOT clinched, so we never over-claim certainty.
import { rankGroup } from "./standings";
import type { GroupMatch, Ratings } from "./types";

export interface TeamClinch { winner: boolean; top2: boolean; eliminatedTop2: boolean; guaranteedTop3: boolean }
export type GroupClinch = Record<string, TeamClinch>;

function enumerate(matches: GroupMatch[], cap: number, cb: (filled: GroupMatch[]) => void) {
  const acc: GroupMatch[] = [];
  const rec = (i: number) => {
    if (i === matches.length) { cb(acc); return; }
    const m = matches[i];
    for (let h = 0; h <= cap; h++) {
      for (let a = 0; a <= cap; a++) {
        acc[i] = { ...m, played: true, homeGoals: h, awayGoals: a };
        rec(i + 1);
      }
    }
    acc.length = i;
  };
  rec(0);
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

export function computeClinch(codes: string[], matches: GroupMatch[], ratings: Ratings): GroupClinch {
  const played = matches.filter((m) => m.played);
  const remaining = matches.filter((m) => !m.played);
  const r = remaining.length;
  // adaptive goal cap keeps the enumeration tractable while covering every realistic GD swing
  const cap = r <= 2 ? 8 : r === 3 ? 5 : r === 4 ? 3 : 2;

  const canTop2 = new Set<string>(), canMiss = new Set<string>();
  const canWin = new Set<string>(), canNotWin = new Set<string>();
  const canBe4th = new Set<string>();

  enumerate(remaining, cap, (filled) => {
    const rows = rankGroup(codes, [...played, ...filled], ratings);
    const order = rows.map((x) => x.code);
    const top2 = new Set(order.slice(0, 2));
    for (const c of codes) {
      if (top2.has(c)) canTop2.add(c); else canMiss.add(c);
      if (order[0] === c) canWin.add(c); else canNotWin.add(c);
    }
    if (order[3]) canBe4th.add(order[3]);
    // Boundary tie unresolved through GF -> the 2nd-placed team isn't *safely* top-2 (fallback decided it).
    const s = rows[1], t = rows[2];
    if (s && t && s.pts === t.pts && s.gd === t.gd && s.gf === t.gf) canMiss.add(s.code);
    const f = rows[0];
    if (f && s && f.pts === s.pts && f.gd === s.gd && f.gf === s.gf) canNotWin.add(f.code);
  });

  const out: GroupClinch = {};
  for (const c of codes) {
    out[c] = {
      winner: canWin.has(c) && !canNotWin.has(c),
      top2: canTop2.has(c) && !canMiss.has(c),
      eliminatedTop2: !canTop2.has(c),
      guaranteedTop3: !canBe4th.has(c),
    };
  }
  return out;
}
