import Link from "next/link";
import { Flag } from "@/components/flag";
import { Delta } from "@/components/delta";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import type { TeamPrediction } from "@/lib/predictions";

// The title race in depth — the masthead states only #1, so this is the "who else is in it" reference: a
// clean hairline-divided leaderboard with a flat bar for magnitude and today's delta. Sits low on the page.
export async function TitleOdds({ teams, className = "" }: { teams: TeamPrediction[]; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const contenders = teams.slice(0, 6);
  const maxTitle = contenders[0]?.title || 1;
  return (
    <section className={`border-border bg-card flex flex-col rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5 ${className}`}>
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("home.titleRace")}</h2>
      <div className="divide-border/50 -mx-1.5 flex-1 divide-y">
        {contenders.map((tm, i) => (
          <Link key={tm.code} href={localeHref(locale, `/team/${slugForCode(tm.code)}`)} className="hover:bg-muted/20 flex items-center gap-2.5 rounded-md px-1.5 py-2 transition-colors">
            <span className="text-muted-2 w-3 text-right font-mono text-[11px] tabular-nums">{i + 1}</span>
            <Flag code={tm.code} size={18} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{tm.name}</span>
            <div className="bg-muted/40 relative h-1.5 w-10 shrink-0 overflow-hidden rounded-full sm:w-12 dark:inset-ring dark:inset-ring-white/5">
              <div className="bg-primary/85 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(tm.title / maxTitle) * 100}%` }} />
            </div>
            <span className="flex shrink-0 items-center justify-end font-mono text-sm font-semibold tabular-nums">
              <span className="w-9 text-right">{forecastPct(tm.title)}</span>
              <span className="w-7 text-left">{<Delta v={tm.titleDelta} />}</span>
            </span>
          </Link>
        ))}
      </div>
      <p className="text-muted-2 mt-3 border-t border-border/50 pt-2.5 text-[11px]">
        <span className="text-win">▲</span><span className="text-destructive">▼</span> {t("home.changeSinceStart")}
      </p>
    </section>
  );
}
