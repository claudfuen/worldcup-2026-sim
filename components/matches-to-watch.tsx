import Link from "next/link";
import type { MatchInfo, TeamPrediction, GroupView } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";

// "Matches to watch" — a curated watch plan, not a fixture dump. One unified appeal score over every
// upcoming match (confirmed fixtures AND the most-likely projected knockout pairings), so a genuinely
// consequential tie surfaces even when it isn't a top-Elo clash. The model, tuned against live data:
//   • matchQuality is weighted to the WEAKER side (a lone superstar vs a minnow is not a watch),
//   • then gated by how CLOSE the tie projects (blowouts collapse, walkovers are dropped outright),
//   • a MARQUEE bonus rewards genuine two-heavyweight clashes (name draw, even if one is favored),
//   • group DECIDERS (advancement / group-winner on the line) and HOST nations get a bump,
//   • everything is multiplied by how LIKELY the pairing is and a gentle PROXIMITY decay.
// Net effect: near-certain, near-term, consequential games rank highest; speculative deep-round
// projections (a 16%-likely "final", a 30%-likely semi) stay out until they're actually imminent and
// the teams are known — so the plan is "what to circle next", never a trivially-obvious "watch the final".
const HOSTS = new Set(["MEX", "USA", "CAN"]);
const STAKES: Record<string, number> = { GROUP: 0.3, R32: 0.55, R16: 0.65, QF: 0.75, SF: 0.85, FINAL: 0.9, "3P": 0.4 };
const ROUND_LABEL: Record<string, string> = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", FINAL: "Final", "3P": "Third place" };
const ROUND_SHORT: Record<string, string> = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", FINAL: "Final", "3P": "3rd" };
const Q0 = 30; // rank at which team quality hits 0
const CERTAINISH = 0.92; // a projected pairing this likely is shown as confirmed (no "proj"/% caveat)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

interface Pick {
  m: MatchInfo;
  home: string | null; away: string | null; homeName: string | null; awayName: string | null;
  lik: number; defined: boolean;
  star: number; both: number; comp: number; dec: number; host: boolean; score: number;
}

function TeamLine({ code, name, dim }: { code: string | null; name: string | null; dim?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Flag code={code} size={18} />
      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${dim ? "text-foreground/85" : ""}`}>{name ?? "TBD"}</span>
    </div>
  );
}

export function MatchesToWatch({
  matches, teams, groups = [], className = "",
}: { matches: MatchInfo[]; teams: TeamPrediction[]; groups?: GroupView[]; className?: string }) {
  // team strength by rank among all 48 (scale-independent), and exact Elo for projected-tie closeness
  const byRating = [...teams].sort((a, b) => (b.ratingExact ?? b.rating) - (a.ratingExact ?? a.rating));
  const rank = new Map(byRating.map((t, i) => [t.code, i + 1]));
  const ratingOf = new Map(teams.map((t) => [t.code, t.ratingExact ?? t.rating]));
  const r = (c: string | null) => rank.get(c ?? "") ?? 48;
  const q = (c: string | null) => clamp01((Q0 - r(c)) / (Q0 - 1));
  // group standings, for "is this group match a decider?"
  const gctx = new Map<string, { advance: number }>();
  for (const g of groups) for (const t of g.teams) gctx.set(t.code, { advance: t.advance });
  const NOW = Date.now();

  // a match's representative pairing: real teams when known, else the modal projected matchup
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
    const bothThrough = x.advance > 0.6 && y.advance > 0.6; // decides the group winner / seeding
    return contested(x) || contested(y) || bothThrough;
  };

  const scored: Pick[] = matches
    .filter((m) => m.status === "scheduled")
    .map((m): Pick | null => {
      const rp = rep(m);
      if (!rp || !rp.h || !rp.a) return null;
      const star = Math.max(q(rp.h), q(rp.a));
      const both = Math.min(q(rp.h), q(rp.a));
      const pairQ = 0.62 * both + 0.38 * star; // matchQuality, weighted to the weaker side
      const comp = competitiveness(m, rp.h, rp.a, rp.defined);
      const stakes = STAKES[m.round] ?? 0.5;
      const qappeal = pairQ * (0.3 + 0.7 * comp); // quality gated by closeness — blowouts collapse
      const stk = 0.3 * stakes * (0.4 + 0.6 * pairQ);
      const host = HOSTS.has(rp.h) || HOSTS.has(rp.a);
      const hostTerm = host ? 0.14 * (0.35 + 0.65 * star) : 0;
      const dec = isDecider(m, rp.h, rp.a) ? 1 : 0;
      const decTerm = dec ? 0.16 * both : 0;
      const marquee = 0.18 * both * star; // two genuine heavyweights — name-clash draw
      const base = qappeal + stk + hostTerm + decTerm + marquee;
      const days = Math.max(0, (Date.parse(m.utc) - NOW) / 86400000);
      const prox = Math.exp(-days / 20);
      const score = base * rp.lik * prox;
      return { m, home: rp.h, away: rp.a, homeName: rp.hn, awayName: rp.an, lik: rp.lik, defined: rp.defined, star, both, comp, dec: decTerm, host, score };
    })
    .filter((p): p is Pick => p != null)
    // editorial rule: never recommend a walkover — keep only competitive games or real deciders
    .filter((p) => p.comp >= 0.18 || p.dec > 0)
    .sort((a, b) => b.score - a.score);

  // adaptive size: an absolute appeal floor (stable across tournament stages), clamped to [4, 6]
  const n = Math.max(4, Math.min(6, scored.filter((p) => p.score >= 0.3).length, scored.length));
  const plan = scored.slice(0, n).sort((a, b) => a.m.utc.localeCompare(b.m.utc));
  if (plan.length === 0) return null;

  return (
    <section className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Matches to watch</h2>
        <Link href="/schedule" className="text-primary text-xs hover:underline">Full schedule →</Link>
      </div>
      <p className="text-muted-2 mb-3 text-xs text-pretty">A curated watch plan — the most consequential games coming up, from group-stage deciders to the knockout ties the bracket is heading toward.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plan.map((p) => {
          const projected = !p.defined && p.lik < CERTAINISH;
          return (
            <Link
              key={p.m.match}
              href={`/match/${p.m.match}`}
              className={`bg-card hover:border-primary/50 hover:bg-surface-raised flex flex-col rounded-xl border p-4 transition-colors ${projected ? "border-border/70 border-dashed" : "border-border"}`}
            >
              <div className="text-muted-foreground mb-2.5 flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate font-mono" suppressHydrationWarning><LocalTime utc={p.m.utc} mode="day" /> · <LocalTime utc={p.m.utc} mode="timeshort" /></span>
                <span className={`shrink-0 font-mono text-[10px] tracking-wide uppercase ${projected ? "text-primary/80" : "text-muted-2"}`}>
                  {p.m.round === "GROUP" ? `Grp ${p.m.group}` : projected ? `${ROUND_SHORT[p.m.round]} · proj` : ROUND_SHORT[p.m.round]}
                </span>
              </div>
              <TeamLine code={p.home} name={p.homeName} dim={projected} />
              <TeamLine code={p.away} name={p.awayName} dim={projected} />
              <div className="text-muted-2 mt-2 truncate text-[11px]">{why(p, r, projected)}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// One-line "why watch this" — the most salient two reasons, ordered by what actually drives the pick.
function why(p: Pick, r: (c: string | null) => number, projected: boolean): string {
  const bits: string[] = [];
  if (p.dec > 0) bits.push(`Group ${p.m.group} decider`);
  else if (projected) bits.push(`~${Math.max(1, Math.round(p.lik * 100))}% likely`);
  else if (p.m.round !== "GROUP") bits.push(ROUND_LABEL[p.m.round] ?? "Knockout");

  const rh = r(p.home), ra = r(p.away);
  if (rh <= 8 && ra <= 8) bits.push("two of the favorites");
  else if (p.host) bits.push("host nation");
  else if (p.comp >= 0.85) bits.push("a coin-flip");
  else if (p.comp >= 0.62) bits.push("finely balanced");
  else if (rh <= 14 && ra <= 14) bits.push("two strong sides");
  else if (p.m.favorite) bits.push(`${p.m.favorite.name} favored`);

  return bits.slice(0, 2).join(" · ");
}
