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
    <section className={className}>
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">Title race</h2>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
        {contenders.map((t, i) => (
          <Link key={t.code} href={`/team/${teamSlug(t.name)}`} className="hover:bg-muted/20 flex items-center gap-2.5 px-3.5 py-2">
            <span className="text-muted-2 w-3 text-right font-mono text-[11px] tabular-nums">{i + 1}</span>
            <Flag code={t.code} size={18} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
            <div className="bg-muted/30 relative hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full sm:block">
              <div className="bg-primary/85 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(t.title / maxTitle) * 100}%` }} />
            </div>
            <span className="flex shrink-0 items-center justify-end gap-1 font-mono text-sm font-semibold tabular-nums">
              {forecastPct(t.title)}<Delta v={t.titleDelta} />
            </span>
          </Link>
        ))}
      </div>
      <p className="text-muted-2 mt-2 text-[11px]">
        <span className="text-win">▲</span><span className="text-destructive">▼</span> change since the start of today
      </p>
    </section>
  );
}
