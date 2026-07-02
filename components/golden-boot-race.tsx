import Link from "next/link";
import { PlayerAvatar } from "@/components/player-avatar";
import { ProbBar } from "@/components/ui/prob-bar";
import { getPlayerImage } from "@/lib/playerImages";
import { playerSlug } from "@/lib/players";
import { forecastPct } from "@/lib/format";
import type { AwardEntry } from "@/lib/awards";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// Homepage snapshot of the Golden Boot race: the top scorers with their faces, goals and chance to win, plus a
// one-line forecast for the leader. The headshot is folded IN (it used to be a separate rail that degraded to
// empty gray circles when images missed) — the PlayerAvatar monogram is the default paint, the cutout a
// progressive enhancement, so a missing photo is a small inline initial beside real data, never a broken row.
// The goals bar uses gold (--contention = leading/crown) on a leader-COUNT domain — a count may normalize to
// the leader; a probability may not.
export async function GoldenBootRace({ entries, className = "" }: { entries: AwardEntry[]; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const top = entries.slice(0, 5);
  const leader = entries[0];
  const maxGoals = leader?.goals || 1;
  const imgs = await Promise.all(top.map((e) => getPlayerImage(e.player, e.teamCode).catch(() => null)));
  return (
    <section className={`border-border bg-card card-surface flex flex-col rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/8 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="eyebrow text-muted-foreground">{t("awards.overviewTitle")}</h2>
        <Link href={localeHref(locale, "/awards")} className="text-primary shrink-0 text-xs font-medium hover:underline">{t("awards.viewFull")}</Link>
      </div>
      {top.length === 0 ? (
        <p className="text-muted-2 py-2 text-sm">{t("awards.overviewEmpty")}</p>
      ) : (
        <>
          <ol className="divide-border/50 -mx-1.5 flex-1 list-none divide-y">
            {top.map((e, i) => (
              <li key={`${e.player}-${e.teamCode}`}>
                <Link href={localeHref(locale, `/player/${playerSlug(e.player, e.teamCode)}`)} className="group hover:bg-muted/20 flex min-h-11 items-center gap-2.5 rounded-md px-1.5 py-1.5">
                  <PlayerAvatar src={imgs[i]} name={e.player} teamCode={e.teamCode} size={30} />
                  <span className="group-hover:text-foreground min-w-0 flex-1 truncate text-sm font-medium">{e.player}</span>
                  <ProbBar value={e.goals} max={maxGoals} hue="contention" dim={i > 0} size="sm" className="hidden w-10 shrink-0 sm:block" />
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                    {e.goals}
                    <span className="text-muted-2 ms-0.5 text-[10px] font-normal" aria-hidden>{t("awards.goalsAbbr")}</span>
                    <span className="sr-only"> {t("awards.colGoals")}</span>
                  </span>
                  <span className="text-contention w-9 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">{e.clinched ? t("awards.won") : forecastPct(e.winProb)}<span className="sr-only"> {t("awards.chance")}</span></span>
                </Link>
              </li>
            ))}
          </ol>
          {leader && (
            <p className="text-muted-2 mt-3 border-t border-border/50 pt-2.5 text-[11px] text-pretty">
              {leader.clinched
                ? t("awards.overviewWon", { player: leader.player, goals: leader.goals })
                : `${t("awards.overviewProjected", { value: leader.projected.toFixed(1), pct: forecastPct(leader.winProb) })} · ${leader.player}`}
            </p>
          )}
        </>
      )}
    </section>
  );
}
