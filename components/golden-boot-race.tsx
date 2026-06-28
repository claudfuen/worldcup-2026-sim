import Link from "next/link";
import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import type { AwardEntry } from "@/lib/awards";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// Homepage snapshot of the Golden Boot race: the top few scorers with their current goals and chance to win,
// plus a one-line forecast for the leader. Mirrors the TitleOdds card; links through to the full awards page.
export async function GoldenBootRace({ entries, className = "" }: { entries: AwardEntry[]; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const top = entries.slice(0, 5);
  const leader = entries[0];
  return (
    <section className={`border-border bg-card flex flex-col rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("awards.overviewTitle")}</h2>
        <Link href={localeHref(locale, "/awards")} className="text-primary shrink-0 text-xs font-medium hover:underline">{t("awards.viewFull")}</Link>
      </div>
      {top.length === 0 ? (
        <p className="text-muted-2 py-2 text-sm">{t("awards.overviewEmpty")}</p>
      ) : (
        <>
          <div className="divide-border/50 -mx-1.5 divide-y">
            {top.map((e, i) => (
              <Link key={`${e.player}-${e.teamCode}`} href={localeHref(locale, `/team/${slugForCode(e.teamCode)}`)} className="hover:bg-muted/20 flex items-center gap-2.5 rounded-md px-1.5 py-2 transition-colors">
                <span className="text-muted-2 w-3 text-right font-mono text-[11px] tabular-nums">{i + 1}</span>
                <Flag code={e.teamCode} size={18} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.player}</span>
                <span className="font-mono text-sm font-semibold tabular-nums">{e.goals}</span>
                <span className="text-muted-2 text-[10px]">{t("awards.goalsAbbr")}</span>
                <span className="w-9 text-right font-mono text-sm font-semibold tabular-nums">{forecastPct(e.winProb)}</span>
              </Link>
            ))}
          </div>
          {leader && (
            <p className="text-muted-2 mt-3 border-t border-border/50 pt-2.5 text-[11px] text-pretty">
              {t("awards.overviewProjected", { value: leader.projected.toFixed(1), pct: forecastPct(leader.winProb) })} · {leader.player}
            </p>
          )}
        </>
      )}
    </section>
  );
}
