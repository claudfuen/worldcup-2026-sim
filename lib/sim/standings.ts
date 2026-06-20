// Group standings with the 2026 FIFA tiebreaker order (Art. 13).
// 2026 RULE CHANGE: head-to-head is applied BEFORE overall goal difference.
// Order after points: H2H pts -> H2H GD -> H2H GF -> overall GD -> overall GF -> conduct -> FIFA ranking.
// Multi-team ties: H2H is computed among ONLY the tied teams and re-applied to any still-tied subset
// before dropping to overall criteria. Conduct (cards) is not simulated; FIFA ranking is proxied by rating.
import type { GroupMatch, TeamRow, Ratings } from "./types";

export function emptyRow(code: string): TeamRow {
  return { code, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

export function computeRows(teamCodes: string[], matches: GroupMatch[]): Record<string, TeamRow> {
  const rows: Record<string, TeamRow> = {};
  for (const c of teamCodes) rows[c] = emptyRow(c);
  for (const m of matches) {
    if (!m.played || m.homeGoals == null || m.awayGoals == null) continue;
    if (!rows[m.home] || !rows[m.away]) continue;
    const h = rows[m.home],
      a = rows[m.away];
    h.played++; a.played++;
    h.gf += m.homeGoals; h.ga += m.awayGoals;
    a.gf += m.awayGoals; a.ga += m.homeGoals;
    if (m.homeGoals > m.awayGoals) { h.w++; a.l++; h.pts += 3; }
    else if (m.homeGoals < m.awayGoals) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts += 1; a.pts += 1; }
  }
  for (const c of teamCodes) rows[c].gd = rows[c].gf - rows[c].ga;
  return rows;
}

// Head-to-head mini-table among `codes`, counting only played matches between those teams.
function h2hKey(code: string, codes: string[], matches: GroupMatch[]): [number, number, number] {
  const set = new Set(codes);
  let pts = 0, gd = 0, gf = 0;
  for (const m of matches) {
    if (!m.played || m.homeGoals == null || m.awayGoals == null) continue;
    if (!set.has(m.home) || !set.has(m.away)) continue;
    if (m.home === code) {
      gf += m.homeGoals; gd += m.homeGoals - m.awayGoals;
      pts += m.homeGoals > m.awayGoals ? 3 : m.homeGoals === m.awayGoals ? 1 : 0;
    } else if (m.away === code) {
      gf += m.awayGoals; gd += m.awayGoals - m.homeGoals;
      pts += m.awayGoals > m.homeGoals ? 3 : m.homeGoals === m.awayGoals ? 1 : 0;
    }
  }
  return [pts, gd, gf];
}

function cmpTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}

// Resolve an order among teams already tied on points, per the 2026 rules. Recursion re-applies H2H to subsets.
function breakTie(codes: string[], matches: GroupMatch[], rows: Record<string, TeamRow>, ratings: Ratings): string[] {
  if (codes.length <= 1) return codes;
  const keyed = codes.map((c) => ({ c, k: h2hKey(c, codes, matches) }));
  keyed.sort((x, y) => cmpTuple(x.k, y.k));
  // Partition into buckets sharing the same H2H key.
  const buckets: string[][] = [];
  for (const { c, k } of keyed) {
    const last = buckets[buckets.length - 1];
    const lastKey = last ? h2hKey(last[0], codes, matches) : null;
    if (last && lastKey && cmpTuple(lastKey, k) === 0) last.push(c);
    else buckets.push([c]);
  }
  if (buckets.length === 1) {
    // H2H made no progress -> overall criteria (GD, GF) then FIFA-ranking proxy (rating, unique -> resolves).
    return [...codes].sort((a, b) =>
      cmpTuple([rows[a].gd, rows[a].gf, ratings[a] ?? 0], [rows[b].gd, rows[b].gf, ratings[b] ?? 0]),
    );
  }
  // Partial separation: re-apply H2H within each still-tied subset.
  const out: string[] = [];
  for (const bucket of buckets) {
    if (bucket.length === 1) out.push(bucket[0]);
    else out.push(...breakTie(bucket, matches, rows, ratings));
  }
  return out;
}

// Full group ranking. Returns TeamRows in finishing order (1st..4th).
export function rankGroup(
  teamCodes: string[],
  matches: GroupMatch[],
  ratings: Ratings,
): TeamRow[] {
  const rows = computeRows(teamCodes, matches);
  // Bucket by points, then break ties within each points-bucket.
  const byPts = [...teamCodes].sort((a, b) => rows[b].pts - rows[a].pts);
  const ordered: string[] = [];
  let i = 0;
  while (i < byPts.length) {
    let j = i;
    while (j < byPts.length && rows[byPts[j]].pts === rows[byPts[i]].pts) j++;
    const tied = byPts.slice(i, j);
    ordered.push(...(tied.length === 1 ? tied : breakTie(tied, matches, rows, ratings)));
    i = j;
  }
  return ordered.map((c) => rows[c]);
}
