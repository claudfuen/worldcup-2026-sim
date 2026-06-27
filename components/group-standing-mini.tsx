import Link from "next/link";
import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import type { GroupTeamView } from "@/lib/predictions";

// A real glimpse INTO a single group: the live table (all four teams, zone-coloured) as a preview card that
// links to the full /group/X page. Used on a match page (the match's own group) so a search lander sees the
// surrounding group race, not just a text pill.
export function GroupStandingMini({ group, teams, className = "" }: { group: string; teams: GroupTeamView[]; className?: string }) {
  return (
    <Link
      href={`/group/${group.toLowerCase()}`}
      className={`group border-border bg-card hover:border-primary/50 hover:bg-surface-raised dark:inset-ring dark:inset-ring-white/5 hover:dark:inset-ring-primary/30 flex flex-col rounded-2xl border p-4 transition-colors ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Group {group}</h3>
        <span className="text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden>→</span>
      </div>
      <div className="flex-1 space-y-1">
        {teams.map((t, i) => {
          const elim = t.status === "eliminated";
          const zone = i <= 1 ? "border-l-win" : i === 2 ? "border-l-contention" : "border-l-transparent";
          return (
            <div key={t.code} className={`flex items-center gap-2 border-l-2 py-1 pl-2 ${zone} ${elim ? "opacity-45" : ""}`}>
              <span className="text-muted-2 w-3 text-center font-mono text-[11px]">{i + 1}</span>
              <Flag code={t.code} size={16} />
              <span className={`min-w-0 flex-1 truncate text-[13px] ${i < 2 ? "font-medium" : "text-foreground/70"} ${elim ? "line-through" : ""}`}>{t.name}</span>
              <span className="text-muted-2 shrink-0 font-mono text-[11px] tabular-nums">{t.played > 0 ? `${t.pts} pt${t.pts === 1 ? "" : "s"}` : forecastPct(t.advance)}</span>
            </div>
          );
        })}
      </div>
      <div className="border-border/50 text-muted-2 mt-3 border-t pt-2.5 text-xs">Full standings &amp; advancement odds</div>
    </Link>
  );
}
