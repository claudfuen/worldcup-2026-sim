import Link from "next/link";
import { Flag } from "@/components/flag";
import { Delta } from "@/components/delta";
import { forecastPct } from "@/lib/format";
import { teamSlug } from "@/lib/slug";
import type { TeamPrediction } from "@/lib/predictions";

// The title race in depth — the masthead states only #1, so this is the "who else is in it" reference: a
// clean hairline-divided leaderboard with a flat bar for magnitude and today's delta. Sits low on the page.
export function TitleOdds({ teams, className = "" }: { teams: TeamPrediction[]; className?: string }) {
  const contenders = teams.slice(0, 6);
  const maxTitle = contenders[0]?.title || 1;
  return (
    <section className={`border-border bg-card flex flex-col rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5 ${className}`}>
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">Title race</h2>
      <div className="divide-border/50 -mx-1.5 flex-1 divide-y">
        {contenders.map((t, i) => (
          <Link key={t.code} href={`/team/${teamSlug(t.name)}`} className="hover:bg-muted/20 flex items-center gap-2.5 rounded-md px-1.5 py-2 transition-colors">
            <span className="text-muted-2 w-3 text-right font-mono text-[11px] tabular-nums">{i + 1}</span>
            <Flag code={t.code} size={18} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
            <div className="bg-muted/40 relative hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full sm:block dark:inset-ring dark:inset-ring-white/5">
              <div className="bg-primary/85 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(t.title / maxTitle) * 100}%` }} />
            </div>
            <span className="flex shrink-0 items-center justify-end font-mono text-sm font-semibold tabular-nums">
              <span className="w-9 text-right">{forecastPct(t.title)}</span>
              <span className="ml-1 w-5 text-left">{<Delta v={t.titleDelta} />}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="text-muted-2 mt-3 border-t border-border/50 pt-2.5 text-[11px]">
        <span className="text-win">▲</span><span className="text-destructive">▼</span> change since the start of today
      </p>
    </section>
  );
}
