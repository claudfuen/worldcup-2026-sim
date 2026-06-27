import Link from "next/link";
import { Flag } from "@/components/flag";
import { Countdown } from "@/components/countdown";
import { pct } from "@/lib/format";
import type { MatchInfo, TeamPrediction } from "@/lib/predictions";

// One honest glimpse of where the bracket is heading — the projected final pairing with each side's
// reach-final %, plus how many Round-of-32 ties are confirmed — as the launch into /bracket. Uses only real
// fields (the final match's projected finalists + teams[code].final); no speculative per-team trophy chain.
export function BracketTeaser({ matches, teams, className = "" }: { matches: MatchInfo[]; teams: TeamPrediction[]; className?: string }) {
  const final = matches.find((m) => m.round === "FINAL");
  if (!final) return null;
  const reachOf = new Map(teams.map((t) => [t.code, t.final]));
  const homeCode = final.home ?? final.projHome?.[0]?.code ?? null;
  const awayCode = final.away ?? final.projAway?.[0]?.code ?? null;
  const homeName = final.homeName ?? final.projHome?.[0]?.name ?? "TBD";
  const awayName = final.awayName ?? final.projAway?.[0]?.name ?? "TBD";
  const r32 = matches.filter((m) => m.round === "R32");
  const setCount = r32.filter((m) => m.defined).length;

  return (
    <Link
      href="/bracket"
      className={`group border-border bg-card hover:border-primary/50 hover:bg-surface-raised dark:inset-ring dark:inset-ring-white/5 hover:dark:inset-ring-primary/30 flex flex-col rounded-2xl border p-4 transition-colors ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Projected final</h2>
        <span className="text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden>→</span>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <FinalSide code={homeCode} name={homeName} reach={reachOf.get(homeCode ?? "")} />
        <span className="text-muted-2 shrink-0 text-xs font-medium">vs</span>
        <FinalSide code={awayCode} name={awayName} reach={reachOf.get(awayCode ?? "")} align="right" />
      </div>
      <div className="border-border/50 mt-3 flex flex-col items-center gap-1 border-t pt-2.5 text-center">
        <Countdown utc={final.utc} label="to the final" />
        <div className="text-muted-2 text-[11px]">{setCount} of {r32.length} Round-of-32 ties confirmed · full bracket</div>
      </div>
    </Link>
  );
}

function FinalSide({ code, name, reach, align }: { code: string | null; name: string; reach?: number; align?: "right" }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <Flag code={code} size={26} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{name}</div>
        {reach != null && <div className="text-muted-2 font-mono text-[10px] tabular-nums">{pct(reach)} to final</div>}
      </div>
    </div>
  );
}
