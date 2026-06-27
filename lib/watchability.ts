import type { MatchInfo, TeamPrediction, GroupView } from "./predictions";

// "Watchability" — a single appeal score per upcoming match, the shared source of truth behind both the
// homepage watch plan and the cross-cutting "hot match" flag shown wherever matches appear. The model
// (tuned against live data): matchQuality weighted to the WEAKER side, gated by how CLOSE the tie projects
// (blowouts collapse, walkovers dropped), a MARQUEE bonus for two-heavyweight clashes, plus group-decider
// and host bumps — all × pairing likelihood × a gentle proximity decay. A match is "hot" iff it's among
// the current top picks, so the badge elsewhere always matches the homepage plan.
const HOSTS = new Set(["MEX", "USA", "CAN"]);
const STAKES: Record<string, number> = { GROUP: 0.3, R32: 0.55, R16: 0.65, QF: 0.75, SF: 0.85, FINAL: 0.9, "3P": 0.4 };
const ROUND_LABEL: Record<string, string> = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", FINAL: "Final", "3P": "Third place" };
const Q0 = 30; // rank at which team quality hits 0
const HOT_N = 6; // the top-N upcoming matches are "hot" (matches the homepage watch plan)
const HOT_FLOOR = 0.3; // …but only if genuinely appealing
export const CERTAINISH = 0.92; // a projected pairing this likely is treated as confirmed (no "proj"/% caveat)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface WatchPick {
  match: MatchInfo;
  home: string | null;
  away: string | null;
  homeName: string | null;
  awayName: string | null;
  defined: boolean; // both participants known (vs a projected pairing)
  lik: number; // how likely this exact pairing is to happen
  score: number;
  comp: number; // competitiveness 0..1
  reason: string; // short "why it's worth watching"
  hot: boolean; // among the current top picks
}

export interface Watchability {
  picks: WatchPick[]; // every appealing upcoming match, sorted by score desc (walkovers already dropped)
  byMatch: Map<number, WatchPick>; // lookup by match number, for badging matches anywhere they're listed
}

export function computeWatchability(matches: MatchInfo[], teams: TeamPrediction[], groups: GroupView[] = []): Watchability {
  const byRating = [...teams].sort((a, b) => (b.ratingExact ?? b.rating) - (a.ratingExact ?? a.rating));
  const rank = new Map(byRating.map((t, i) => [t.code, i + 1]));
  const ratingOf = new Map(teams.map((t) => [t.code, t.ratingExact ?? t.rating]));
  const r = (c: string | null) => rank.get(c ?? "") ?? 48;
  const q = (c: string | null) => clamp01((Q0 - r(c)) / (Q0 - 1));
  const gctx = new Map<string, { advance: number }>();
  for (const g of groups) for (const t of g.teams) gctx.set(t.code, { advance: t.advance });
  // Proximity reference = the soonest upcoming kickoff (deterministic — no wall-clock read during render).
  let t0 = Infinity;
  for (const m of matches) if (m.status === "scheduled") t0 = Math.min(t0, Date.parse(m.utc));

  const rep = (m: MatchInfo) => {
    if (m.home && m.away) return { h: m.home, a: m.away, hn: m.homeName, an: m.awayName, lik: 1, defined: true };
    const mu = m.topMatchups?.[0];
    if (mu) return { h: mu.home, a: mu.away, hn: mu.homeName, an: mu.awayName, lik: mu.prob, defined: false };
    return null;
  };
  const competitiveness = (m: MatchInfo, h: string, a: string, defined: boolean) => {
    if (defined && m.probs) return 1 - Math.abs(m.probs.home - m.probs.away);
    const rh = ratingOf.get(h) ?? 1500, ra = ratingOf.get(a) ?? 1500;
    const pH = 1 / (1 + Math.pow(10, -(rh - ra) / 400));
    return 1 - Math.abs(2 * pH - 1);
  };
  const isDecider = (m: MatchInfo, h: string, a: string) => {
    if (m.round !== "GROUP") return false;
    const x = gctx.get(h), y = gctx.get(a);
    if (!x || !y) return false;
    const contested = (t: { advance: number }) => t.advance > 0.08 && t.advance < 0.95;
    return contested(x) || contested(y) || (x.advance > 0.6 && y.advance > 0.6);
  };
  const reasonFor = (m: MatchInfo, h: string, a: string, comp: number, dec: boolean, host: boolean) => {
    const rh = r(h), ra = r(a);
    if (dec) return `Group ${m.group} decider`;
    if (rh <= 8 && ra <= 8) return "Two of the favorites";
    if (comp >= 0.85) return "Coin-flip";
    if (rh <= 14 && ra <= 14) return "Two strong sides";
    if (host) return "Host nation";
    if (comp >= 0.62) return "Finely balanced";
    return ROUND_LABEL[m.round] ?? "Knockout tie";
  };

  const scored: WatchPick[] = [];
  for (const m of matches) {
    if (m.status !== "scheduled") continue;
    const rp = rep(m);
    if (!rp || !rp.h || !rp.a) continue;
    const dec = isDecider(m, rp.h, rp.a);
    const comp = competitiveness(m, rp.h, rp.a, rp.defined);
    if (!(comp >= 0.18 || dec)) continue; // editorial rule: never recommend a walkover
    const star = Math.max(q(rp.h), q(rp.a));
    const both = Math.min(q(rp.h), q(rp.a));
    const pairQ = 0.62 * both + 0.38 * star; // matchQuality, weighted to the weaker side
    const stakes = STAKES[m.round] ?? 0.5;
    const qappeal = pairQ * (0.3 + 0.7 * comp); // quality gated by closeness
    const stk = 0.3 * stakes * (0.4 + 0.6 * pairQ);
    const host = HOSTS.has(rp.h) || HOSTS.has(rp.a);
    const hostTerm = host ? 0.14 * (0.35 + 0.65 * star) : 0;
    const decTerm = dec ? 0.16 * both : 0;
    const marquee = 0.18 * both * star; // two genuine heavyweights
    const base = qappeal + stk + hostTerm + decTerm + marquee;
    const days = Math.max(0, (Date.parse(m.utc) - t0) / 86400000);
    const prox = Math.exp(-days / 20);
    const score = base * rp.lik * prox;
    scored.push({
      match: m, home: rp.h, away: rp.a, homeName: rp.hn, awayName: rp.an,
      defined: rp.defined, lik: rp.lik, score, comp, reason: reasonFor(m, rp.h, rp.a, comp, dec, host), hot: false,
    });
  }
  scored.sort((x, y) => y.score - x.score);
  scored.forEach((p, i) => { p.hot = i < HOT_N && p.score >= HOT_FLOOR; });
  return { picks: scored, byMatch: new Map(scored.map((p) => [p.match.match, p])) };
}
