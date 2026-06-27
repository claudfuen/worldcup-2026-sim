import Link from "next/link";
import type { MatchInfo, TeamPrediction, GroupView } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { computeWatchability, CERTAINISH, type WatchPick } from "@/lib/watchability";

// "Matches to watch" — the curated watch plan. The appeal model now lives in lib/watchability.ts (shared
// with the cross-cutting "hot match" badge), so the plan here and the badges elsewhere always agree: the
// hot picks ARE the plan. Cards show the soonest-first hot matches with a short "why".
const ROUND_SHORT: Record<string, string> = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", FINAL: "Final", "3P": "3rd" };

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
  const { picks } = computeWatchability(matches, teams, groups);
  const plan = picks.filter((p) => p.hot).sort((a, b) => a.match.utc.localeCompare(b.match.utc));
  if (plan.length === 0) return null;

  return (
    <section className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Matches to watch</h2>
        <Link href="/schedule" className="text-primary text-xs hover:underline">Full schedule →</Link>
      </div>
      <p className="text-muted-2 mb-3 text-xs text-pretty">A curated watch plan — the most consequential games coming up, from group-stage deciders to the knockout ties the bracket is heading toward. Dashed cards are projected pairings, with how likely they are to happen.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plan.map((p) => <WatchCard key={p.match.match} p={p} />)}
      </div>
    </section>
  );
}

function WatchCard({ p }: { p: WatchPick }) {
  const m = p.match;
  const projected = !p.defined && p.lik < CERTAINISH;
  const note = projected ? `~${Math.max(1, Math.round(p.lik * 100))}% likely · ${p.reason}` : p.reason;
  return (
    <Link
      href={`/match/${m.match}`}
      className={`bg-card hover:border-primary/50 hover:bg-surface-raised flex flex-col rounded-xl border p-4 transition-colors ${projected ? "border-border/70 border-dashed" : "border-border"}`}
    >
      <div className="text-muted-foreground mb-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate font-mono" suppressHydrationWarning><LocalTime utc={m.utc} mode="day" /> · <LocalTime utc={m.utc} mode="timeshort" /></span>
        <span className={`shrink-0 font-mono text-[10px] tracking-wide uppercase ${projected ? "text-primary/80" : "text-muted-2"}`}>
          {m.round === "GROUP" ? `Grp ${m.group}` : projected ? `${ROUND_SHORT[m.round]} · proj` : ROUND_SHORT[m.round]}
        </span>
      </div>
      <TeamLine code={p.home} name={p.homeName} dim={projected} />
      <TeamLine code={p.away} name={p.awayName} dim={projected} />
      <div className="text-muted-2 mt-2 truncate text-[11px]">{note}</div>
    </Link>
  );
}
