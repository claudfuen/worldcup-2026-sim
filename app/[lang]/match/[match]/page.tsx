import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { slugForCode } from "@/lib/slug";
import { pct, forecastPct } from "@/lib/format";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { LocalTime } from "@/components/local-time";
import { provisionalGroup, ratingsFromTeams, finalizeGroups, finalizeBracket } from "@/lib/liveProjection";
import { ProvisionalStandings } from "@/components/provisional-standings";
import { WinProbBar } from "@/components/win-prob-bar";
import { MatchOutlook } from "@/components/match-outlook";
import { BracketPath } from "@/components/bracket-path";
import { ShareBar } from "@/components/share-bar";
import { computeWatchability } from "@/lib/watchability";
import { TicketLink } from "@/components/ticket-link";
import { hasTickets, TICKET_PROVIDER } from "@/lib/tickets";
import { fifaVenue } from "@/lib/venues";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Countdown } from "@/components/countdown";
import { type RelLink } from "@/components/related-links";
import { ExploreSection } from "@/components/explore-section";
import { GroupStandingMini } from "@/components/group-standing-mini";
import { BracketTeaser } from "@/components/bracket-teaser";
import { GroupsPreview } from "@/components/groups-preview";
import { TitleOdds } from "@/components/title-odds";
import type { Metadata } from "next";
import { getT, getLocale, type TFunction } from "@/lib/i18n/server";
import { localizeMatch, localizeTeams } from "@/lib/i18n/localize-payload";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref, type Locale } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Map a match's round code (m.round, which can be "3P") to a translated round name via the shared
// rounds.* namespace. "3P" → rounds.THIRD; everything else keys straight through.
function roundName(t: TFunction, round: string): string {
  return t(`rounds.${round === "3P" ? "THIRD" : round}`);
}

export async function generateMetadata({ params }: { params: Promise<{ match: string }> }): Promise<Metadata> {
  const { match } = await params;
  const t = await getT();
  const locale = await getLocale();
  try {
    const data = await getPredictions();
    const m = data.matches.find((x) => x.match === Number(match));
    if (!m) return { title: t("match.metaTitleFallback", { match }) };
    const home = m.home ? t(`teams.${m.home}`) : m.slotHome ? prettySlot(t, m.slotHome) : t("common.tbd");
    const away = m.away ? t(`teams.${m.away}`) : m.slotAway ? prettySlot(t, m.slotAway) : t("common.tbd");
    const title = t("match.metaTitle", { home, away });
    const description = t("match.metaDesc", { home, away });
    return {
      title: { absolute: title },
      description,
      alternates: buildAlternates(`/match/${m.match}`, locale),
      openGraph: { title, description, url: localeHref(locale, `/match/${m.match}`), type: "article" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: t("match.metaTitleFallback", { match }) };
  }
}

export default async function MatchPage({ params }: { params: Promise<{ match: string }> }) {
  const { match } = await params;
  const t = await getT();
  const locale = await getLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  // Lock this match's participants the instant the feeding group(s) decide, ahead of the cron.
  const hasLive = liveActivity(data.matches, live);
  const ratings = ratingsFromTeams(data.teams);
  const allMatches = hasLive ? finalizeBracket(overlaid, finalizeGroups(data.groups, overlaid, ratings), ratings) : overlaid;
  const found = allMatches.find((x) => x.match === Number(match));
  if (!found) notFound();
  // Localize display names (home/away, projected candidates, matchups, favorite) right before render —
  // AFTER the live transforms, which re-derive English names from TEAM_BY_CODE. Slugs/codes stay English.
  const m = localizeMatch(found, t);
  const state: "final" | "live" | "defined" | "undefined" =
    m.status === "final" ? "final" : m.status === "live" ? "live" : m.defined ? "defined" : "undefined";
  // Is this one of the current watch-plan picks? (same scorer as the homepage "matches to watch")
  const heat = computeWatchability(allMatches, data.teams, data.groups).byMatch.get(m.match);
  // Both teams' path-to-the-final odds, for the tournament-outlook comparison (only when both are known).
  // Localized for <MatchOutlook> (which renders their names) while codes/ratings pass through untouched.
  const homeRaw = m.home ? data.teams.find((p) => p.code === m.home) : undefined;
  const awayRaw = m.away ? data.teams.find((p) => p.code === m.away) : undefined;
  const homePred = homeRaw ? localizeTeams([homeRaw], t)[0] : undefined;
  const awayPred = awayRaw ? localizeTeams([awayRaw], t)[0] : undefined;
  // SportsEvent structured data - only for a real, named matchup (slot placeholders aren't teams).
  const eventLd =
    m.defined && m.homeName && m.awayName
      ? {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: t(m.group ? "match.eventNameGroup" : "match.eventName", {
            home: m.homeName,
            away: m.awayName,
            round: roundName(t, m.round),
            ...(m.group ? { group: m.group } : {}),
          }),
          sport: "Association football",
          startDate: m.utc,
          eventStatus: "https://schema.org/EventScheduled",
          location: { "@type": "Place", name: fifaVenue(m.venue), address: m.city },
          competitor: [
            { "@type": "SportsTeam", name: m.homeName },
            { "@type": "SportsTeam", name: m.awayName },
          ],
          organizer: { "@type": "Organization", name: "FIFA", url: "https://www.fifa.com" },
          superEvent: { "@type": "SportsEvent", name: "FIFA World Cup 2026" },
          url: `https://worldcup2026predictions.app/match/${m.match}`,
        }
      : null;

  // "If the live score holds" provisional group standings, for an in-progress group-stage match.
  const proj =
    state === "live" && m.group
      ? provisionalGroup(
          m.group,
          allMatches.filter((x) => x.round === "GROUP" && x.group === m.group),
          ratings,
        )
      : null;

  const matchLabel = t("match.matchLabel", {
    home: m.homeName ?? prettySlot(t, m.slotHome),
    away: m.awayName ?? prettySlot(t, m.slotAway),
  });
  // Breadcrumb parents are contextual: group matches sit under their Group; knockouts under the Bracket.
  const crumbs =
    m.round === "GROUP" && m.group
      ? [{ label: t("match.crumbHome"), href: localeHref(locale, "/") }, { label: t("nav.groups"), href: localeHref(locale, "/groups") }, { label: t("match.groupLabel", { group: m.group }), href: localeHref(locale, `/group/${m.group.toLowerCase()}`) }, { label: matchLabel }]
      : [{ label: t("match.crumbHome"), href: localeHref(locale, "/") }, { label: t("nav.bracket"), href: localeHref(locale, "/bracket") }, { label: roundName(t, m.round), href: localeHref(locale, "/bracket") }, { label: matchLabel }];
  // Live-finalized standings for the explore-section group preview (a window into the match's own group).
  const groups = hasLive ? finalizeGroups(data.groups, overlaid, ratings) : data.groups;
  const groupView = m.group ? groups.find((g) => g.group === m.group) : undefined;
  // Secondary pill links beneath the preview cards: both teams (so non-top-6 sides stay reachable) + schedule.
  const exploreLinks: RelLink[] = [];
  if (m.home && m.homeName) exploreLinks.push({ label: t(`teams.${m.home}`), href: localeHref(locale, `/team/${slugForCode(m.home)}`), code: m.home });
  if (m.away && m.awayName) exploreLinks.push({ label: t(`teams.${m.away}`), href: localeHref(locale, `/team/${slugForCode(m.away)}`), code: m.away });
  exploreLinks.push({ label: t("match.fullSchedule"), href: localeHref(locale, "/schedule") });
  exploreLinks.push({ label: t("match.howItWorks"), href: localeHref(locale, "/methodology") });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {eventLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventLd) }} />}
      <LiveAutoRefresh enabled={liveActivity(data.matches.filter((x) => x.match === m.match), live)} />
      <h1 className="sr-only">
        {t("match.srHeading", {
          home: m.homeName ?? prettySlot(t, m.slotHome),
          away: m.awayName ?? prettySlot(t, m.slotAway),
          round: roundName(t, m.round),
        })}
      </h1>
      <Breadcrumbs items={crumbs} />

      {/* The matchup IS the header — a big, full-width hero. Supporting facts/odds form the "tail" below.
          A resolved tie shows the teams + score/win-prob; a PREDICTED tie shows each slot's contender race
          inline (like the bracket cards) — no thin "likely X%" + redundant repeat. */}
      <section className="hero-sheen border-border-strong relative mt-5 overflow-hidden rounded-3xl border bg-surface-raised px-5 py-7 sm:px-10 sm:py-9 dark:inset-ring dark:inset-ring-white/5">
        <div className="text-primary mb-6 text-center font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">
          {m.group ? t("match.heroEyebrowGroup", { round: roundName(t, m.round), group: m.group }) : roundName(t, m.round)} <span className="text-muted-2">{t("match.heroMatchNo", { match: m.match })}</span>
        </div>
        {state === "undefined" ? (
          <div className="flex items-start justify-center gap-3 sm:gap-12">
            <HeroSlot m={m} side="home" t={t} locale={locale} />
            <span className="text-muted-2 flex size-11 shrink-0 items-center justify-center self-center rounded-full bg-background/40 font-mono text-[11px] font-semibold tracking-[0.12em] uppercase ring-1 ring-white/5 ring-inset dark:bg-black/15" aria-hidden>{t("common.vs")}</span>
            <HeroSlot m={m} side="away" t={t} locale={locale} />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 sm:gap-12">
            <ScoreTeam m={m} side="home" locale={locale} t={t} />
            <div className="flex shrink-0 flex-col items-center gap-2.5 rounded-xl bg-background/40 px-4 py-3 ring-1 ring-white/5 ring-inset dark:bg-black/15">
              {state === "final" || state === "live" ? (
                <span className="font-mono text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-6xl">
                  {m.homeScore}<span className="text-muted-2 mx-2 align-middle text-[0.7em] font-normal">–</span>{m.awayScore}
                </span>
              ) : (
                <span className="text-muted-2 font-mono text-xs font-semibold tracking-[0.15em] uppercase">{t("common.vs")}</span>
              )}
              {state === "final" ? (
                <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{t("match.fullTime")}</span>
              ) : state === "live" ? (
                <span className="text-live inline-flex items-center gap-1.5 text-xs font-semibold">
                  <span className="bg-live size-1.5 animate-pulse rounded-full" />{m.liveDetail}
                </span>
              ) : (
                <span className="text-muted-2 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase" suppressHydrationWarning><LocalTime utc={m.utc} mode="day" /></span>
              )}
            </div>
            <ScoreTeam m={m} side="away" locale={locale} t={t} />
          </div>
        )}
        {state === "defined" && m.probs && (
          <div className="mx-auto mt-7 max-w-xl rounded-xl bg-background/30 px-5 py-4 ring-1 ring-white/5 ring-inset dark:bg-black/10">
            <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
            {m.round !== "GROUP" && <p className="text-muted-2 mt-3 text-center text-xs">{t("match.regulationNote")}</p>}
          </div>
        )}
        {state === "undefined" && (
          <p className="text-muted-2 mx-auto mt-7 max-w-xl rounded-xl bg-background/30 px-5 py-4 text-center text-xs text-pretty ring-1 ring-white/5 ring-inset dark:bg-black/10">
            {t("match.undefinedSlots", { iterations: data.iterations })}
          </p>
        )}
        {(state === "defined" || state === "undefined") && (
          <div className="mt-6 flex justify-center">
            <Countdown utc={m.utc} label={t("match.toKickoff")} />
          </div>
        )}
      </section>

      {/* Facts strip — the tail: a recessed well bonded to the hero, as a divided KPI ribbon. */}
      <div className="border-border bg-card/60 mt-3 rounded-2xl border p-4 backdrop-blur-sm sm:p-5 dark:bg-card/50">
        <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
          <Fact label={t("match.factKickoff")} value={<LocalTime utc={m.utc} mode="datetime" />} />
          <Fact label={t("match.factVenue")} value={t("match.venueCity", { venue: fifaVenue(m.venue), city: m.city })} />
          <Fact label={t("match.factStage")} value={
            <>
              {m.round === "GROUP" && m.group ? (
                <Link href={localeHref(locale, `/group/${m.group.toLowerCase()}`)} className="hover:text-primary underline-offset-2 hover:underline">{t("match.groupLabel", { group: m.group })}</Link>
              ) : (
                <Link href={localeHref(locale, "/bracket")} className="hover:text-primary underline-offset-2 hover:underline">{roundName(t, m.round)}</Link>
              )}
              <span className="text-muted-2"> {t("match.factMatchNo", { match: m.match })}</span>
            </>
          } />
          <Fact
            label={heat?.hot ? t("match.factWorthWatching") : t("match.factStatus")}
            value={
              heat?.hot ? (
                <span className="text-contention">{t(heat.reason.key, heat.reason.params)}</span>
              ) : state === "final" ? (
                t("match.fullTime")
              ) : state === "live" ? (
                <span className="text-live inline-flex items-center gap-1.5 font-medium"><span className="bg-live size-1.5 animate-pulse rounded-full" />{t("common.liveNow")}</span>
              ) : (
                t("match.statusUpcoming")
              )
            }
          />
        </div>
        {state !== "final" && state !== "live" && hasTickets(m.match) && (
          <div className="border-border/50 mt-4 flex flex-col gap-2.5 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-2 text-xs">{t("match.ticketsCaption", { provider: TICKET_PROVIDER })}</p>
            <TicketLink matchNo={m.match} placement="match_facts" variant="button" className="sm:w-auto sm:px-5" />
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <ShareBar
          text={
            state === "final"
              ? t("match.shareFinal", { home: m.homeName, homeScore: m.homeScore, awayScore: m.awayScore, away: m.awayName, round: roundName(t, m.round) })
              : m.favorite && m.home && m.away
                ? t("match.shareFavorite", { favorite: m.favorite.name, pct: Math.round(m.favorite.winProb * 100), home: m.homeName, away: m.awayName })
                : t("match.shareUpcoming", { home: m.homeName ?? prettySlot(t, m.slotHome), away: m.awayName ?? prettySlot(t, m.slotAway) })
          }
          path={`/match/${m.match}`}
        />
      </div>

      {state === "defined" && m.probs && (
        <p className="text-muted-foreground mt-8 max-w-3xl text-sm text-pretty">{predictionProse(t, m, homePred?.rating, awayPred?.rating)}</p>
      )}

      {/* State-specific body */}
      {state === "final" && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.preMatchRead")}</h2>
          <div className="border-border bg-card rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5">
            {m.probs ? (
              <>
                <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
                <p className="text-muted-2 mt-4 text-xs">
                  {m.xg && <>{t("match.expectedGoalsPrefix", { home: m.xg.home.toFixed(1), away: m.xg.away.toFixed(1) })} </>}
                  {t("match.actualResult")} <span className="text-foreground/80 font-medium">{m.homeScore}–{m.awayScore}</span>.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("match.fullTimeLabel")} <span className="text-foreground font-medium">{m.homeName} {m.homeScore}–{m.awayScore} {m.awayName}</span>.
              </p>
            )}
          </div>
        </section>
      )}

      {state === "live" && m.probs && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">
            {t("match.preMatchWinProb")}
          </h2>
          <div className="border-border bg-card rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5">
            <p className="text-live mb-3 text-xs font-medium">
              {t("match.liveScoreLine", { home: m.homeName, homeScore: m.homeScore, awayScore: m.awayScore, away: m.awayName, detail: m.liveDetail })}
            </p>
            <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
            <p className="text-muted-2 mt-4 text-xs">{t("match.forecastUpdatesNote")}</p>
          </div>
        </section>
      )}

      {homePred && awayPred && <MatchOutlook round={m.round} home={homePred} away={awayPred} />}

      <BracketPath m={m} all={allMatches} />

      {proj && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">
            {t("match.groupIfEndsLikeThis", { group: proj.group })}
          </h2>
          <ProvisionalStandings proj={proj} />
        </section>
      )}

      {state === "defined" && m.topScores && m.topScores.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.mostLikelyScorelines")}</h2>
            {m.xg && <span className="text-muted-foreground text-xs">{t("match.xgLabel", { home: m.xg.home.toFixed(1), away: m.xg.away.toFixed(1) })}</span>}
          </div>
          <div className="border-border bg-card divide-border/50 divide-y rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
            {m.topScores.map((s) => (
              <div key={`${s.h}-${s.a}`} className="flex items-center gap-2.5 px-4 py-2.5">
                <Flag code={m.home} size={16} />
                <span className="w-10 font-mono text-sm font-semibold tracking-[-0.01em] tabular-nums">{s.h}–{s.a}</span>
                <Flag code={m.away} size={16} />
                <div className="bg-muted/40 relative ml-1 h-1.5 flex-1 overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
                  <div className="bg-primary/85 absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out" style={{ width: `${(s.prob / m.topScores![0].prob) * 100}%` }} />
                </div>
                <span className="text-foreground/90 w-10 text-right font-mono text-xs font-semibold tabular-nums">{pct(s.prob)}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-2 mt-2 text-xs">
            {t("match.scorelinesNote", {
              count: m.topScores.length,
              rest: pct(Math.max(0, 1 - m.topScores.reduce((acc, s) => acc + s.prob, 0))),
            })}
          </p>
        </section>
      )}

      <ExploreSection links={exploreLinks}>
        {m.round === "GROUP" && groupView ? (
          <GroupStandingMini group={groupView.group} teams={groupView.teams} />
        ) : (
          <GroupsPreview groups={groups} />
        )}
        <BracketTeaser matches={allMatches} teams={data.teams} />
        <TitleOdds teams={data.teams} />
      </ExploreSection>
    </main>
  );
}

// Natural-language model read for an upcoming, fully-defined match: unique per-page prose that answers
// "who does the model favour and how" - the snippet a search result wants. Percentages cap at 99% (a
// single match is a forecast, never a certainty), matching the rest of the site.
function predictionProse(t: TFunction, m: MatchInfo, homeRating?: number, awayRating?: number): string {
  const { home, draw, away } = m.probs!;
  const cap = (v: number) => Math.max(1, Math.round(Math.min(v, 0.99) * 100));
  const favHome = home >= away;
  const favName = favHome ? m.homeName : m.awayName;
  const dogName = favHome ? m.awayName : m.homeName;
  const favPct = cap(favHome ? home : away);
  const top = m.topScores?.[0];
  const scoreStr = top
    ? " " +
      t(m.xg ? "match.proseScoreXg" : "match.proseScore", {
        home: m.homeName,
        away: m.awayName,
        h: top.h,
        a: top.a,
        ...(m.xg ? { xgHome: m.xg.home.toFixed(1), xgAway: m.xg.away.toFixed(1) } : {}),
      })
    : "";
  let whyStr = "";
  if (homeRating != null && awayRating != null) {
    const gap = Math.round(homeRating - awayRating);
    const abs = Math.abs(gap);
    whyStr =
      " " +
      (abs >= 25
        ? t("match.proseWhyEdge", { stronger: gap >= 0 ? m.homeName : m.awayName, elo: abs })
        : t("match.proseWhyTight", { elo: abs }));
  }
  const lead = t("match.proseLead", {
    favorite: favName,
    favPct,
    underdog: dogName,
    drawArt: artForPct(cap(draw)),
    drawPct: cap(draw),
  });
  return `${lead}${scoreStr}${whyStr}`;
}

// "a" vs "an" before a spoken percentage: 8, 11, 18 and 80-89 ("eight", "eleven", "eighteen", "eighty…")
// begin with a vowel sound, so they take "an"; every other 1-99 value takes "a".
function artForPct(n: number): string {
  return n === 8 || n === 11 || n === 18 || (n >= 80 && n <= 89) ? "an" : "a";
}

function prettySlot(t: TFunction, s?: string): string {
  if (!s) return t("common.tbd");
  if (/^1[A-L]$/.test(s)) return t("match.slotWinnerGroup", { group: s[1] });
  if (/^2[A-L]$/.test(s)) return t("match.slotRunnerUpGroup", { group: s[1] });
  if (s.startsWith("3:")) return t("match.slotThird", { groups: s.slice(2).split(",").join("/") });
  if (s.startsWith("W")) return t("match.slotWinnerOf", { match: s.slice(1) });
  if (s.startsWith("L")) return t("match.slotLoserOf", { match: s.slice(1) });
  return s;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  // Divided KPI ribbon: a vertical hairline before every cell except the first of each row (2-up mobile,
  // 4-up desktop), so the facts read as one instrument cluster rather than four floating pairs.
  return (
    <div className="border-border/60 min-w-0 [&:not(:nth-child(2n+1))]:border-l [&:not(:nth-child(2n+1))]:pl-4 sm:[&:not(:nth-child(4n+1))]:border-l sm:[&:not(:nth-child(4n+1))]:pl-6 sm:[&:nth-child(4n+1)]:border-l-0 sm:[&:nth-child(4n+1)]:pl-0">
      <div className="text-muted-2 mb-1.5 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{label}</div>
      <div className="text-foreground/90 text-sm leading-snug">{value}</div>
    </div>
  );
}

// One side of a RESOLVED matchup (defined/live/final): flag + team name, linking to the team page. The
// winner is tinted green, the loser muted. Predicted (unresolved) ties use <HeroSlot> instead.
function ScoreTeam({ m, side, locale, t }: { m: MatchInfo; side: "home" | "away"; locale: Locale; t: TFunction }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const score = side === "home" ? m.homeScore : m.awayScore;
  const other = side === "home" ? m.awayScore : m.homeScore;
  const win = m.status === "final" && (m.winner ? m.winner === resolved : score != null && other != null && score > other);
  const lose = m.status === "final" && m.winner != null && !win;
  if (!resolved || !name) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center">
        <Flag code={null} size={64} />
        <div className="text-muted-2 text-sm">{t("common.tbd")}</div>
      </div>
    );
  }
  return (
    <Link
      href={localeHref(locale, `/team/${slugForCode(resolved)}`)}
      className="group/team focus-visible:ring-primary/50 focus-visible:ring-offset-surface-raised flex min-w-0 flex-1 flex-col items-center gap-3 rounded-xl text-center transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span className={lose ? "opacity-60 saturate-[0.85]" : ""}><Flag code={resolved} size={64} /></span>
      <div className={`decoration-primary/40 group-hover/team:text-primary font-display text-xl leading-tight font-semibold tracking-[-0.02em] text-balance underline-offset-4 group-hover/team:underline sm:text-2xl ${win ? "text-win" : lose ? "text-muted-foreground" : ""}`}>{name}</div>
    </Link>
  );
}

// One side of a PREDICTED matchup hero. Mirrors the settled side (big flag + name) so both heroes feel
// the same, but the headline is the projected team's chance of filling this slot — with a probability bar
// and the next-most-likely alternate beneath. A clinched side (partially-decided tie) shows a ✓ instead.
function HeroSlot({ m, side, t, locale }: { m: MatchInfo; side: "home" | "away"; t: TFunction; locale: Locale }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const cands = (side === "home" ? m.projHome : m.projAway) ?? [];

  if (resolved && name) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center">
        <div className="text-muted-2 max-w-full truncate font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{prettySlot(t, slot)}</div>
        <Link href={localeHref(locale, `/team/${slugForCode(resolved)}`)} className="group/team flex flex-col items-center gap-3 transition-colors">
          <Flag code={resolved} size={64} />
          <div className="decoration-primary/40 group-hover/team:text-primary font-display text-xl leading-tight font-semibold tracking-[-0.02em] text-balance underline-offset-4 group-hover/team:underline sm:text-2xl">{name}</div>
        </Link>
        <div className="text-win inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5 10 17.5 19 7" /></svg>
          {t("match.confirmed")}
        </div>
      </div>
    );
  }

  const top = cands[0];
  if (!top) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center">
        <div className="text-muted-2 max-w-full truncate font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{prettySlot(t, slot)}</div>
        <Flag code={null} size={64} />
        <div className="text-muted-2 text-sm">{t("match.toBeDecided")}</div>
      </div>
    );
  }
  // The projected occupant is shown big; the next three contenders sit beneath as "if not" alternates.
  const rest = cands.slice(1).filter((c) => c.prob >= 0.02).slice(0, 3);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center">
      <div className="text-muted-2 max-w-full truncate font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{prettySlot(t, slot)}</div>
      <Link href={localeHref(locale, `/team/${slugForCode(top.code)}`)} className="group/team flex flex-col items-center gap-3 transition-colors">
        <Flag code={top.code} size={64} />
        <div className="decoration-primary/40 group-hover/team:text-primary font-display text-xl leading-tight font-semibold tracking-[-0.02em] text-balance underline-offset-4 group-hover/team:underline sm:text-2xl">{top.name}</div>
      </Link>
      <div className="mt-0.5 w-full max-w-[13rem]">
        <div className="bg-muted/40 h-1.5 overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
          <div className="bg-primary h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.round(Math.min(top.prob, 0.99) * 100)}%` }} />
        </div>
        <div className="mt-2.5">
          <div className="text-primary font-mono text-2xl font-semibold tracking-[-0.02em] tabular-nums sm:text-3xl">{forecastPct(top.prob)}</div>
          <div className="text-muted-2 mt-0.5 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{t("match.toReachThisMatch")}</div>
        </div>
      </div>
      {rest.length > 0 && (
        <div className="border-border/50 mt-2 w-full max-w-[13rem] space-y-1.5 border-t pt-3">
          <div className="text-muted-2 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{t("match.ifNot")}</div>
          {rest.map((r) => (
            <Link key={r.code} href={localeHref(locale, `/team/${slugForCode(r.code)}`)} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors">
              <Flag code={r.code} size={14} />
              <span className="min-w-0 flex-1 truncate text-left">{r.name}</span>
              <span className="shrink-0 font-mono tabular-nums">{forecastPct(r.prob)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
