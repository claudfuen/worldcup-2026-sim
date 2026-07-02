import Link from "next/link";
import { Flag } from "@/components/flag";
import { Countdown } from "@/components/countdown";
import { ProbBar } from "@/components/ui/prob-bar";
import { forecastPct } from "@/lib/format";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import { decidedOnPens, pensScore } from "@/lib/penalties";
import type { MatchInfo, TeamPrediction } from "@/lib/predictions";

// One honest glimpse of where the bracket is heading — the projected final pairing with each side's
// reach-final %, plus how many Round-of-32 ties are confirmed — as the launch into /bracket. Uses only real
// fields (the final match's projected finalists + teams[code].final); no speculative per-team trophy chain.
export async function BracketTeaser({ matches, teams, className = "" }: { matches: MatchInfo[]; teams: TeamPrediction[]; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const final = matches.find((m) => m.round === "FINAL");
  if (!final) return null;
  const reachOf = new Map(teams.map((t) => [t.code, t.final]));
  const homeCode = final.home ?? final.projHome?.[0]?.code ?? null;
  const awayCode = final.away ?? final.projAway?.[0]?.code ?? null;
  const homeName = final.homeName ?? final.projHome?.[0]?.name ?? t("common.tbd");
  const awayName = final.awayName ?? final.projAway?.[0]?.name ?? t("common.tbd");
  const r32 = matches.filter((m) => m.round === "R32");
  const setCount = r32.filter((m) => m.defined).length;
  const played = final.status === "final"; // the final has been played → show the result, not the projection
  const championName = played ? (final.winner === homeCode ? homeName : awayName) : null;
  const onPens = decidedOnPens(final);
  const ps = pensScore(final);

  const homeReach = played ? undefined : reachOf.get(homeCode ?? "");
  const awayReach = played ? undefined : reachOf.get(awayCode ?? "");
  const scoreLine = played ? (
    <>
      {final.homeScore}<span className="text-muted-2">–</span>{final.awayScore}
      {onPens && ps && <span className="text-muted-2 ms-1 text-[10px] font-normal">({t("common.penScore", { home: ps.home, away: ps.away })})</span>}
    </>
  ) : (
    t("common.vs")
  );

  return (
    <Link
      href={localeHref(locale, "/bracket")}
      className={`group border-border bg-card card-surface hover:border-primary/50 hover:bg-surface-raised dark:inset-ring dark:inset-ring-white/8 hover:dark:inset-ring-primary/30 flex h-full flex-col rounded-2xl border p-4 transition-colors ${className}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="eyebrow text-muted-foreground">{played ? t("home.finalResult") : t("home.projectedFinal")}</h2>
        <span className="text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden>→</span>
      </div>

      {/* finalists stacked vertically, spread to fill the card height */}
      <div className="flex flex-1 flex-col justify-center gap-2 py-4">
        <FinalRow code={homeCode} name={homeName} reach={homeReach} reachLabel={t("home.toFinal")} won={played && final.winner === homeCode} />
        <div className="flex items-center gap-3 ps-[3.25rem]">
          <span className="text-muted-2 font-mono text-[11px] font-semibold tabular-nums">{scoreLine}</span>
          <span className="border-border/60 flex-1 border-t" aria-hidden />
        </div>
        <FinalRow code={awayCode} name={awayName} reach={awayReach} reachLabel={t("home.toFinal")} won={played && final.winner === awayCode} />
      </div>

      <div className="border-border/50 mt-auto border-t pt-3">
        {played ? (
          <div className="text-contention font-mono text-[11px] font-semibold tracking-wide uppercase">{t("home.championsLine", { team: championName })}</div>
        ) : (
          <div className="flex flex-col gap-1">
            <Countdown utc={final.utc} label={t("home.toTheFinal")} />
            <div className="text-muted-2 text-[11px]">{t("home.r32Confirmed", { set: setCount, total: r32.length })}</div>
          </div>
        )}
      </div>
    </Link>
  );
}

// One finalist, full-width: a large crest, the team name, and a reach-the-final bar + %. Stacked vertically
// in the card so the projected pairing reads top-to-bottom and fills the height.
function FinalRow({ code, name, reach, reachLabel, won }: { code: string | null; name: string; reach?: number; reachLabel: string; won?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Flag code={code} size={40} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-lg font-semibold tracking-tight ${won ? "text-win" : ""}`}>{name}</div>
        {reach != null && (
          <div className="mt-1.5 flex items-center gap-2">
            <ProbBar value={reach} max={0.5} hue="primary" size="sm" className="w-full max-w-[7rem]" />
            <span className="text-muted-foreground font-mono text-[11px] tabular-nums">{forecastPct(reach)} {reachLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
