import type { Metadata } from "next";
import { getPredictions } from "@/lib/getPredictions";
import { computeMatchAccuracy, computeTournamentAccuracy, preTournamentForecast } from "@/lib/scorecard";
import { Flag } from "@/components/flag";
import { RelatedLinks } from "@/components/related-links";
import { pct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import { TEAM_BY_CODE } from "@/lib/data/teams";
import { getT, getLocale, type TFunction } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("scorecard.metaTitle");
  const description = t("scorecard.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/scorecard", locale),
    openGraph: { title, description, url: localeHref(locale, "/scorecard"), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ScorecardPage() {
  const t = await getT();
  const locale = await getLocale();
  const data = await getPredictions();
  const acc = computeMatchAccuracy(data.matches);

  // Tournament-level call needs the (cached) pre-tournament forecast — only fetch it once it can say something
  // (group stage complete → advance hit-rate; final played → champion call).
  const r32Resolved = data.matches.filter((m) => m.round === "R32" && m.home && m.away).length === 32;
  const tourney = r32Resolved || data.champion ? computeTournamentAccuracy(data.matches, data.champion, await preTournamentForecast()) : null;

  const verdict = !acc
    ? t("scorecard.verdictEmpty")
    : t("scorecard.verdict", { n: acc.n, favPct: pct(acc.favouriteAccuracy), brier: acc.brier.toFixed(3), baseline: acc.brierBaseline.toFixed(3) });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("scorecard.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("scorecard.heading")}</h1>
        <p className="text-foreground mt-2 text-base text-pretty">{verdict}</p>
        <p className="text-muted-2 mt-2 text-xs text-pretty">{t("scorecard.subhead")}</p>
      </header>

      {!acc ? (
        <div className="border-border bg-card rounded-2xl border p-8 text-center dark:inset-ring dark:inset-ring-white/5">
          <p className="text-muted-2 text-sm text-pretty">{t("scorecard.emptyState")}</p>
        </div>
      ) : (
        <>
          {/* Headline metrics */}
          <div className="grid grid-cols-3 gap-3">
            <Stat value={pct(acc.favouriteAccuracy)} label={t("scorecard.statFavourite")} sub={t("scorecard.statFavouriteSub")} accent />
            <Stat value={acc.brier.toFixed(3)} label={t("scorecard.statBrier")} sub={t("scorecard.statBrierSub", { baseline: acc.brierBaseline.toFixed(3) })} />
            <Stat value={`+${Math.round(acc.skill * 100)}%`} label={t("scorecard.statSkill")} sub={t("scorecard.statSkillSub")} />
          </div>

          {/* Calibration */}
          {acc.calibration.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight">{t("scorecard.calibrationHeading")}</h2>
              <p className="text-muted-2 mt-0.5 mb-3 text-xs text-pretty">{t("scorecard.calibrationDesc")}</p>
              <div className="border-border bg-card rounded-2xl border p-2 dark:inset-ring dark:inset-ring-white/5">
                <div className="text-muted-2 mb-1 hidden grid-cols-[5rem_1fr_4rem_3rem] gap-2 px-2 font-mono text-[10px] tracking-wide uppercase sm:grid">
                  <span>{t("scorecard.colBucket")}</span>
                  <span className="text-center">{t("scorecard.colPredVsActual")}</span>
                  <span className="text-right">{t("scorecard.colActual")}</span>
                  <span className="text-right">{t("scorecard.colMatches")}</span>
                </div>
                <div className="divide-border/50 divide-y">
                  {acc.calibration.map((b) => (
                    <CalRow key={b.label} bin={b} t={t} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Tournament-level call */}
          {tourney && (tourney.advanceTotal || tourney.championRank) && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold tracking-tight">{t("scorecard.callHeading")}</h2>
              <div className="border-border bg-card mt-3 divide-border/50 divide-y rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
                {tourney.championCode && tourney.championRank && (
                  <div className="flex items-center gap-3 p-4">
                    <Flag code={tourney.championCode} size={22} />
                    <p className="text-sm text-pretty">
                      {t("scorecard.championCall", {
                        champion: TEAM_BY_CODE[tourney.championCode]?.name ?? tourney.championCode,
                        rank: ordinalSuffix(tourney.championRank),
                        pct: pct(tourney.championProb ?? 0),
                      })}
                    </p>
                  </div>
                )}
                {tourney.advanceTotal && (
                  <div className="flex items-baseline gap-3 p-4">
                    <span className="text-primary font-mono text-xl font-semibold tabular-nums">{tourney.advanceCalled}/{tourney.advanceTotal}</span>
                    <p className="text-sm text-pretty">{t("scorecard.advanceCall", { called: tourney.advanceCalled ?? 0, total: tourney.advanceTotal })}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          <p className="text-muted-2 mt-6 text-xs text-pretty">{t("scorecard.footnote")}</p>
        </>
      )}

      <RelatedLinks
        links={[
          { label: t("nav.method"), href: localeHref(locale, "/methodology"), hint: t("scorecard.linkMethodHint") },
          { label: t("nav.bracket"), href: localeHref(locale, "/bracket") },
          { label: t("nav.overview"), href: localeHref(locale, "/") },
        ]}
      />
    </main>
  );
}

function Stat({ value, label, sub, accent }: { value: string; label: string; sub: string; accent?: boolean }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5">
      <div className={`font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="text-foreground/90 mt-1 text-xs font-medium">{label}</div>
      <div className="text-muted-2 mt-0.5 text-[11px] text-pretty">{sub}</div>
    </div>
  );
}

// A calibration row: the predicted vs actual hit-rate for one confidence bucket, with paired bars so over/under
// confidence reads at a glance (bars near-equal length = well calibrated).
function CalRow({ bin, t }: { bin: { label: string; predicted: number; actual: number; n: number }; t: TFunction }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-2 px-2 py-2.5 sm:grid-cols-[5rem_1fr_4rem_3rem]">
      <span className="font-mono text-xs font-semibold tabular-nums">{bin.label}</span>
      <div className="flex flex-col gap-1">
        <Bar value={bin.predicted} cls="bg-muted-foreground/40" tag={t("scorecard.predictedTag")} />
        <Bar value={bin.actual} cls="bg-primary" tag={t("scorecard.actualTag")} />
      </div>
      <span className="text-foreground/90 hidden text-right font-mono text-xs font-semibold tabular-nums sm:block">{pct(bin.actual)}</span>
      <span className="text-muted-2 text-right font-mono text-[11px] tabular-nums">{bin.n}</span>
    </div>
  );
}

function Bar({ value, cls, tag }: { value: number; cls: string; tag: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-2 w-8 shrink-0 font-mono text-[9px] tracking-wide uppercase">{tag}</span>
      <div className="bg-muted/40 h-1.5 flex-1 overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
      </div>
      <span className="text-muted-2 w-9 shrink-0 text-right font-mono text-[10px] tabular-nums">{pct(value)}</span>
    </div>
  );
}

// 1 → "1st", 2 → "2nd"… (English; the locale catalogs can override the whole sentence if needed).
function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
