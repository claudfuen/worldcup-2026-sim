import Link from "next/link";
import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import type { AwardEntry } from "@/lib/awards";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// One awards leaderboard (Golden Boot or assists): current tally → projected final → P(win). A hairline-
// divided list, no card chrome (the page section wraps it). Player names are proper nouns (not localized);
// the team name is. Each row links to the scorer's team page. Mobile keeps tally + win%; desktop adds the
// secondary metric and the projection.
export async function AwardsBoard({ entries, metric, limit = 20 }: { entries: AwardEntry[]; metric: "goals" | "assists"; limit?: number }) {
  const t = await getT();
  const locale = await getLocale();
  const rows = entries.slice(0, limit);
  const maxWin = rows[0]?.winProb || 1;
  return (
    <div className="-mx-1.5">
      <div className="divide-border/50 divide-y">
        {rows.map((e, i) => {
          const value = metric === "goals" ? e.goals : e.assists;
          const secondary = metric === "goals" ? e.assists : e.goals;
          const secLabel = metric === "goals" ? t("awards.assistsAbbr") : t("awards.goalsAbbr");
          return (
            <Link
              key={`${e.player}-${e.teamCode}`}
              href={localeHref(locale, `/team/${slugForCode(e.teamCode)}`)}
              className="hover:bg-muted/20 flex items-center gap-2.5 rounded-md px-1.5 py-2.5 transition-colors"
            >
              <span className="text-muted-2 w-5 shrink-0 text-right font-mono text-xs tabular-nums">{i + 1}</span>
              <Flag code={e.teamCode} size={20} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.player}</div>
                <div className="text-muted-2 truncate text-xs">
                  {t(`teams.${e.teamCode}`)}
                  {metric === "goals" && e.penalties > 0 && <span> · {t("awards.penNote", { n: e.penalties })}</span>}
                </div>
              </div>
              {/* secondary metric (assists on the boot board, goals on the assists board) — desktop only */}
              <div className="hidden w-11 shrink-0 text-right sm:block">
                <span className="font-mono text-sm tabular-nums">{secondary}</span>
                <span className="text-muted-2 text-[10px]"> {secLabel}</span>
              </div>
              {/* current tally — the headline number */}
              <div className="w-8 shrink-0 text-right font-mono text-lg font-semibold tabular-nums">{value}</div>
              {/* projected final */}
              <div className="text-muted-2 hidden w-14 shrink-0 text-right font-mono text-xs tabular-nums sm:block">→ {e.projected.toFixed(1)}</div>
              {/* P(win) with a magnitude bar (normalized to the leader) */}
              <div className="flex w-[4.5rem] shrink-0 items-center justify-end gap-1.5">
                <div className="bg-muted/40 hidden h-1.5 w-7 overflow-hidden rounded-full sm:block dark:inset-ring dark:inset-ring-white/5">
                  <div className="bg-primary/85 h-full rounded-full" style={{ width: `${(e.winProb / maxWin) * 100}%` }} />
                </div>
                <span className="w-9 text-right font-mono text-sm font-semibold tabular-nums">{forecastPct(e.winProb)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
