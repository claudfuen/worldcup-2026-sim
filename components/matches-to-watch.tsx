import Link from "next/link";
import type { MatchInfo, TeamPrediction } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";

// "Matches to watch" — a forward watch plan, not a flat fixture dump. It blends:
//   • team quality by RANK among all 48 (scale-independent — two top-8 sides score high, a #24 vs #21 does not),
//   • how competitive the tie projects, and
//   • the stakes of the round (group < R32 < … < final; a knockout is inherently more critical).
// Two strands, merged chronologically into one plan:
//   • CERTAIN — the best near-term fixtures whose teams are already known, and
//   • PROJECTED — the single marquee tie the bracket is heading toward in each future round (the modal
//     forecast pairing + how likely it actually happens), so you can pencil in the blockbusters in advance.
// Validated against live /api/predictions output before shipping (Colombia–Portugal surfaces, Algeria does not;
// the projected path runs Portugal–Spain R16 → … → Spain–Argentina final).
const STAKE: Record<string, number> = { GROUP: 0.9, R32: 1.0, R16: 1.2, QF: 1.45, SF: 1.7, FINAL: 2.0, "3P": 0.9 };
const STAGE_SHORT: Record<string, string> = { GROUP: "Group", R32: "R32", R16: "R16", QF: "QF", SF: "SF", FINAL: "Final", "3P": "3rd place" };
const ROUND_LABEL: Record<string, string> = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", FINAL: "Final", "3P": "Third place" };
const FUTURE_ROUNDS = ["R16", "QF", "SF", "FINAL"];
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

interface Pick {
  kind: "certain" | "projected";
  m: MatchInfo;
  home: string | null; away: string | null; homeName: string | null; awayName: string | null;
  closeness: number; likelihood?: number; score: number;
}

function TeamLine({ code, name, dim }: { code: string | null; name: string | null; dim?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Flag code={code} size={18} />
      <span className={`truncate text-sm font-medium ${dim ? "text-foreground/85" : ""}`}>{name ?? "TBD"}</span>
    </div>
  );
}

export function MatchesToWatch({ matches, teams, certainLimit = 4, className = "" }: { matches: MatchInfo[]; teams: TeamPrediction[]; certainLimit?: number; className?: string }) {
  const byRating = [...teams].sort((a, b) => (b.ratingExact ?? b.rating) - (a.ratingExact ?? a.rating));
  const rank = new Map(byRating.map((t, i) => [t.code, i + 1]));
  const r = (c: string | null) => rank.get(c ?? "") ?? 48;
  const quality = (c: string | null) => clamp01((24 - r(c)) / 23);

  // Strand 1: best near-term fixtures with known teams.
  const certain: Pick[] = matches
    .filter((m) => m.status === "scheduled" && m.home && m.away && m.probs)
    .map((m) => {
      const mq = (quality(m.home) + quality(m.away)) / 2;
      const closeness = 1 - Math.abs(m.probs!.home - m.probs!.away);
      return { kind: "certain", m, home: m.home, away: m.away, homeName: m.homeName, awayName: m.awayName, closeness, score: (0.35 + 0.5 * mq + 0.15 * closeness) * (STAKE[m.round] ?? 1) } as Pick;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, certainLimit);

  // Strand 2: the marquee projected tie in each still-undecided future round.
  const bestByRound = new Map<string, Pick>();
  for (const m of matches) {
    if (m.status !== "scheduled" || m.defined || !FUTURE_ROUNDS.includes(m.round)) continue;
    const mu = m.topMatchups?.[0];
    if (!mu) continue;
    const mq = (quality(mu.home) + quality(mu.away)) / 2;
    if (mq < 0.45) continue; // only genuine blockbusters
    const score = (0.35 + 0.5 * mq) * (STAKE[m.round] ?? 1);
    const prev = bestByRound.get(m.round);
    if (!prev || score > prev.score) {
      bestByRound.set(m.round, { kind: "projected", m, home: mu.home, away: mu.away, homeName: mu.homeName, awayName: mu.awayName, closeness: 0, likelihood: mu.prob, score });
    }
  }

  const plan = [...certain, ...bestByRound.values()].sort((a, b) => a.m.utc.localeCompare(b.m.utc));
  if (plan.length === 0) return null;

  const note = (p: Pick) => {
    const bits: string[] = [];
    if (p.kind === "certain" && p.m.round !== "GROUP") bits.push(ROUND_LABEL[p.m.round] ?? "Knockout");
    const rh = r(p.home), ra = r(p.away);
    if (rh <= 8 && ra <= 8) bits.push("two of the favorites");
    else if (rh <= 14 && ra <= 14) bits.push("two strong sides");
    else if (rh <= 8 || ra <= 8) bits.push(`${rh <= 8 ? p.homeName : p.awayName} in action`);
    if (p.kind === "certain") {
      if (p.closeness > 0.84) bits.push("a coin-flip");
      else if (p.closeness > 0.62) bits.push("finely balanced");
      else if (bits.length === 0 && p.m.favorite) bits.push(`${p.m.favorite.name} favored`);
    } else {
      bits.push(`~${Math.max(1, Math.round((p.likelihood ?? 0) * 100))}% likely`);
    }
    return bits.filter(Boolean).slice(0, 2).join(" · ");
  };

  return (
    <section className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Matches to watch</h2>
        <Link href="/schedule" className="text-primary text-xs hover:underline">Full schedule →</Link>
      </div>
      <p className="text-muted-2 mb-3 text-xs text-pretty">A watch plan, not the full fixture list — the best near-term games plus the marquee ties the bracket is heading toward (with how likely each is to actually happen).</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plan.map((p) => (
          <Link
            key={`${p.kind}-${p.m.match}`}
            href={`/match/${p.m.match}`}
            className={`bg-card hover:border-primary/50 hover:bg-surface-raised flex flex-col rounded-xl border p-4 ${p.kind === "projected" ? "border-border/70 border-dashed" : "border-border"}`}
          >
            <div className="text-muted-foreground mb-2.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono" suppressHydrationWarning><LocalTime utc={p.m.utc} mode="day" /> · <LocalTime utc={p.m.utc} mode="time" /></span>
              <span className={`font-mono text-[10px] tracking-wide uppercase ${p.kind === "projected" ? "text-primary/80" : "text-muted-2"}`}>
                {p.kind === "projected" ? `${STAGE_SHORT[p.m.round]} · proj` : p.m.group ? `Grp ${p.m.group}` : STAGE_SHORT[p.m.round]}
              </span>
            </div>
            <TeamLine code={p.home} name={p.homeName} dim={p.kind === "projected"} />
            <TeamLine code={p.away} name={p.awayName} dim={p.kind === "projected"} />
            <div className="text-muted-2 mt-2 truncate text-[11px]">{note(p)}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
