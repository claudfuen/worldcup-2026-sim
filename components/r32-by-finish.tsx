import Link from "next/link";
import type { MatchInfo, TeamPrediction } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { forecastPct } from "@/lib/format";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// Where a team lands in the Round of 32 depends on how it finishes its group. For 1st/2nd the bracket slot
// (1X/2X) is fixed, so we resolve the exact R32 match and its likely opponent from the live bracket. A
// 3rd-place finish routes via FIFA's Annex C — a best-third always meets a group WINNER, but which one
// depends on the final qualifying set — so that row is shown as a route, not a fixed tie.
function opponent(m: MatchInfo, ourSlot: string) {
  const ourHome = m.slotHome === ourSlot;
  const code = (ourHome ? m.away : m.home) ?? null; // resolved (locked) opponent, if any
  const name = ourHome ? m.awayName : m.homeName;
  const proj = (ourHome ? m.projAway : m.projHome)?.[0]; // else the model's most-likely occupant
  return { code: code ?? proj?.code ?? null, name: name ?? proj?.name ?? null, locked: !!code, prob: code ? null : proj?.prob ?? null };
}

const TONE: Record<string, string> = {
  "1": "text-win border-win/30 bg-win/10",
  "2": "text-contention border-contention/30 bg-contention/10",
  "3": "text-muted-foreground border-border bg-muted/40",
};

export async function R32ByFinish({ matches, group, pred }: { matches: MatchInfo[]; group: string; pred: TeamPrediction }) {
  const t = await getT();
  const locale = await getLocale();
  const r32 = matches.filter((m) => m.round === "R32");
  const find = (slot: string) => r32.find((m) => m.slotHome === slot || m.slotAway === slot);

  const rows = (
    [
      { key: "1", label: t("groups.routeWinGroup"), prob: pred.winGroup, slot: `1${group}` },
      { key: "2", label: t("groups.routeRunnerUp"), prob: pred.runnerUp, slot: `2${group}` },
      { key: "3", label: t("groups.routeBestThird"), prob: pred.third, slot: null as string | null },
    ] as const
  )
    .filter((f) => f.prob >= 0.01)
    .map((f) => ({ ...f, m: f.slot ? find(f.slot) : undefined }))
    .filter((f) => f.key === "3" || f.m); // drop a 1st/2nd route only if its match somehow isn't in the bracket
  if (!rows.length) return null;

  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("groups.routeHeading")}</h2>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
        {rows.map((f) => {
          const opp = f.m && f.slot ? opponent(f.m, f.slot) : null;
          const certain = f.prob >= 0.9995;
          const inner = (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${TONE[f.key]}`}>{f.label}</span>
              <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums">
                {certain ? <span className="text-win">✓</span> : <span className="text-muted-foreground">{forecastPct(f.prob)}</span>}
              </span>
              {f.m ? (
                <>
                  <span className="text-muted-2 hidden shrink-0 text-xs sm:inline" suppressHydrationWarning>
                    M{f.m.match} · <LocalTime utc={f.m.utc} mode="day" /> · {f.m.city}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-sm">
                    <span className="text-muted-2 text-xs">{t("common.vs")}</span>
                    {opp?.code ? <Flag code={opp.code} size={16} /> : <span className="bg-muted/40 size-4 shrink-0 rounded-[2px]" aria-hidden />}
                    <span className={`truncate ${opp?.locked ? "font-semibold" : "text-foreground/80"}`}>{opp?.name ?? t("common.tbd")}</span>
                    {opp?.prob != null && <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">{forecastPct(opp.prob)}</span>}
                  </span>
                </>
              ) : (
                <span className="text-foreground/70 flex-1 text-right text-sm">
                  {t("groups.routeFacesWinner")} <span className="text-muted-2">{t("groups.routeTieSet")}</span>
                </span>
              )}
            </div>
          );
          return f.m ? (
            <Link key={f.key} href={localeHref(locale, `/match/${f.m.match}`)} className="hover:bg-muted/20 block transition-none">{inner}</Link>
          ) : (
            <div key={f.key}>{inner}</div>
          );
        })}
      </div>
      <p className="text-muted-2 mt-2 text-xs text-pretty">{t("groups.routeFootnote", { name: pred.name, group })}</p>
    </section>
  );
}
