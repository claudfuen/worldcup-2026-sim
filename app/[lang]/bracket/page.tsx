import type { Metadata } from "next";
import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { finalizeGroups, finalizeBracket, ratingsFromTeams } from "@/lib/liveProjection";
import { Bracket } from "@/components/bracket";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { fifaVenue } from "@/lib/venues";
import type { MatchInfo } from "@/lib/predictions";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { ShareBar } from "@/components/share-bar";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import { RelatedLinks } from "@/components/related-links";
import { getT, getLocale } from "@/lib/i18n/server";
import { localizeMatches, localizeTeam } from "@/lib/i18n/localize-payload";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("bracket.metaTitle");
  const description = t("bracket.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/bracket", locale),
    openGraph: { title, description, url: localeHref(locale, "/bracket"), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BracketPage() {
  const t = await getT();
  const locale = await getLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const hasLive = liveActivity(data.matches, live);
  // Lock knockout participants the instant their group decides (and resolve third-place slots once the
  // group stage completes), rather than waiting for the next cron tick.
  const overlaid = overlayLive(data.matches, live);
  const ratings = ratingsFromTeams(data.teams);
  const rawMatches = hasLive ? finalizeBracket(overlaid, finalizeGroups(data.groups, overlaid, ratings), ratings) : data.matches;
  // Localize team display names AFTER the finalize transforms (which re-derive English names).
  const matches = localizeMatches(rawMatches, t);
  // Champion: the realized winner once the tournament's over, else the model's favourite.
  const complete = data.complete;
  const championRaw = complete && data.champion ? data.teams.find((tt) => tt.code === data.champion) : data.teams[0];
  const champ = championRaw ? localizeTeam(championRaw, t) : undefined;
  const finalM = matches.find((m) => m.round === "FINAL");
  const fHomeName = finalM?.homeName ?? finalM?.projHome?.[0]?.name ?? null;
  const fAwayName = finalM?.awayName ?? finalM?.projAway?.[0]?.name ?? null;
  // Past-tense final result line, for the over state.
  const finalResult = complete && finalM && finalM.homeName && finalM.awayName && finalM.homeScore != null
    ? t("bracket.finalLine", { home: finalM.homeName, hs: finalM.homeScore, as: finalM.awayScore, away: finalM.awayName })
    : null;
  const r32 = matches.filter((m) => m.round === "R32");
  const r32Set = r32.filter((m) => m.defined).length;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <header className="mb-6 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("bracket.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("bracket.heading")}</h1>
        {champ && complete ? (
          <p className="mt-3 text-base text-pretty">
            <Link href={localeHref(locale, `/team/${slugForCode(champ.code)}`)} className="text-foreground font-semibold hover:underline">{champ.name}</Link>{" "}
            {t("bracket.wonTrophy")}{finalResult && <span className="text-muted-foreground"> {finalResult}</span>}
          </p>
        ) : champ ? (
          <p className="mt-3 text-base text-pretty">
            {t("bracket.roadIntro")}{" "}
            <Link href={localeHref(locale, `/team/${slugForCode(champ.code)}`)} className="text-foreground font-semibold hover:underline">{champ.name}</Link>{t("bracket.liftTrophy")}{" "}
            <span className="text-primary font-semibold tabular-nums">{forecastPct(champ.title)}</span>
            {fHomeName && fAwayName && <>{t("bracket.withFinalPre")}<span className="text-foreground/90 font-medium">{fHomeName}</span>–<span className="text-foreground/90 font-medium">{fAwayName}</span>{t("bracket.withFinalPost")}</>}.
            <span className="text-muted-foreground"> {t("bracket.confirmedTies", { set: r32Set, total: r32.length })}</span>
          </p>
        ) : null}
        <p className="text-muted-2 mt-3 text-xs text-pretty">
          {t("bracket.footnotePre")}<span className="text-foreground/70">%</span>{t("bracket.footnotePost")}
        </p>
        {champ && (
          <div className="mt-4">
            <ShareBar
              text={complete ? t("bracket.shareWon", { team: champ.name }) : t("bracket.shareText", { team: champ.name, pct: forecastPct(champ.title) })}
              path="/bracket"
            />
          </div>
        )}
      </header>
      <Bracket
        matches={matches}
        champion={champ ? { code: champ.code, name: champ.name, prob: champ.title, won: complete } : undefined}
      />
      <div className="border-border bg-card mt-6 rounded-2xl border p-4">
        <h2 className="mb-2 text-base font-semibold tracking-tight">{t("rounds.THIRD")}</h2>
        <ThirdPlace m={matches.find((x) => x.match === 103)} tbd={t("common.tbd")} vs={t("common.vs")} projectedLabel={t("common.projected")} />
      </div>
      <RelatedLinks
        links={[
          { label: t("bracket.relGroups"), href: localeHref(locale, "/groups") },
          { label: t("bracket.relSchedule"), href: localeHref(locale, "/schedule") },
          { label: t("bracket.relOverview"), href: localeHref(locale, "/"), hint: t("bracket.relOverviewHint") },
        ]}
      />
    </main>
  );
}

function ThirdPlace({ m, tbd, vs, projectedLabel }: { m?: MatchInfo; tbd: string; vs: string; projectedLabel: string }) {
  if (!m) return null;
  const final = m.status === "final";
  // Resolved participants if known, else the projected top candidate for each slot. `confirmed` distinguishes
  // a locked team (a decided semi-final loser) from the model's best guess so the two never read the same.
  const h = m.home ? { code: m.home, name: m.homeName ?? m.home, prob: undefined } : m.projHome?.[0];
  const a = m.away ? { code: m.away, name: m.awayName ?? m.away, prob: undefined } : m.projAway?.[0];
  const hWon = final && m.winner === h?.code;
  const aWon = final && m.winner === a?.code;
  const anyProjected = !final && ((!m.home && !!h) || (!m.away && !!a));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {h && <Flag code={h.code} size={16} />}
        <ThirdSide name={h?.name ?? tbd} won={hWon} confirmed={!!m.home} prob={m.home ? undefined : h?.prob} />
        {final ? (
          <span className="text-foreground font-mono font-semibold tabular-nums">{m.homeScore}<span className="text-muted-2">–</span>{m.awayScore}</span>
        ) : (
          <span className="text-muted-foreground">{vs}</span>
        )}
        {a && <Flag code={a.code} size={16} />}
        <ThirdSide name={a?.name ?? tbd} won={aWon} confirmed={!!m.away} prob={m.away ? undefined : a?.prob} />
        <span className="text-muted-2">· {fifaVenue(m.venue)}, {m.city} · <LocalTime utc={m.utc} mode="day" /></span>
      </div>
      {anyProjected && (
        <span className="text-data-cool border-data-cool/30 bg-data-cool/10 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase">
          {projectedLabel}
        </span>
      )}
    </div>
  );
}

// One side of the third-place play-off. A confirmed (decided) semi-final loser reads at full strength; a
// projected one is dimmed and carries its slot probability, so a best-guess never looks locked in.
function ThirdSide({ name, won, confirmed, prob }: { name: string; won: boolean; confirmed: boolean; prob?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={won ? "text-win font-medium" : confirmed ? "text-foreground/90" : "text-foreground/60"}>{name}</span>
      {!confirmed && prob != null && <span className="text-muted-2 font-mono text-[11px] tabular-nums">{forecastPct(prob)}</span>}
    </span>
  );
}
