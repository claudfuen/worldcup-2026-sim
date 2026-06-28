import Link from "next/link";
import { Flag } from "@/components/flag";
import { Countdown } from "@/components/countdown";
import { forecastPct } from "@/lib/format";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
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

  return (
    <Link
      href={localeHref(locale, "/bracket")}
      className={`group border-border bg-card hover:border-primary/50 hover:bg-surface-raised dark:inset-ring dark:inset-ring-white/5 hover:dark:inset-ring-primary/30 flex flex-col rounded-2xl border p-4 transition-colors ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">{played ? t("home.finalResult") : t("home.projectedFinal")}</h2>
        <span className="text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden>→</span>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <FinalSide code={homeCode} name={homeName} reach={played ? undefined : reachOf.get(homeCode ?? "")} reachLabel={t("home.toFinal")} won={played && final.winner === homeCode} />
        <span className="text-muted-2 shrink-0 text-sm font-semibold tabular-nums">{played ? <>{final.homeScore}<span className="text-muted-2">–</span>{final.awayScore}</> : t("common.vs")}</span>
        <FinalSide code={awayCode} name={awayName} reach={played ? undefined : reachOf.get(awayCode ?? "")} reachLabel={t("home.toFinal")} align="right" won={played && final.winner === awayCode} />
      </div>
      <div className="border-border/50 mt-3 flex flex-col items-center gap-1 border-t pt-2.5 text-center">
        {played ? (
          <div className="text-contention font-mono text-[11px] font-semibold tracking-wide uppercase">{t("home.championsLine", { team: championName })}</div>
        ) : (
          <>
            <Countdown utc={final.utc} label={t("home.toTheFinal")} />
            <div className="text-muted-2 text-[11px]">{t("home.r32Confirmed", { set: setCount, total: r32.length })}</div>
          </>
        )}
      </div>
    </Link>
  );
}

function FinalSide({ code, name, reach, reachLabel, align, won }: { code: string | null; name: string; reach?: number; reachLabel: string; align?: "right"; won?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <Flag code={code} size={26} />
      <div className="min-w-0">
        <div className={`truncate text-sm font-semibold ${won ? "text-win" : ""}`}>{name}</div>
        {reach != null && <div className="text-muted-2 font-mono text-[10px] tabular-nums">{forecastPct(reach)} {reachLabel}</div>}
      </div>
    </div>
  );
}
