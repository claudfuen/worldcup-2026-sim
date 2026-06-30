import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getPlayerImage } from "@/lib/playerImages";
import { loadMatchLive, type MatchLivePayload } from "@/lib/matchLive";
import type { MatchInfo } from "@/lib/predictions";
import { slugForCode } from "@/lib/slug";
import { MatchHero, MatchBody, MatchFacts } from "@/components/match-live";
import { MatchOutlook } from "@/components/match-outlook";
import { BracketPath } from "@/components/bracket-path";
import { MatchPathForward } from "@/components/match-path-forward";
import { computeWatchability } from "@/lib/watchability";
import { fifaVenue } from "@/lib/venues";
import { FIFA_RANK } from "@/lib/data/fifaRankings";
import { Breadcrumbs } from "@/components/breadcrumbs";
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
import { localeHref } from "@/lib/i18n/config";

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
  const loaded = await loadMatchLive(Number(match));
  if (!loaded) notFound();
  const { data, all, groups, m: foundRaw, summary, liveProbs, proj, hasLive } = loaded;

  // Each side's strength rank by our Elo (of the 48-team field) — the "top-X vs top-Y" matchup context. The
  // chip toggles to the official FIFA ranking (FIFA_RANK), kept as a stored reference.
  const eloRanked = [...data.teams].sort((a, b) => (b.ratingExact ?? b.rating) - (a.ratingExact ?? a.rating));
  const eloRankOf = (code?: string | null): number | undefined => {
    if (!code) return undefined;
    const i = eloRanked.findIndex((tm) => tm.code === code);
    return i >= 0 ? i + 1 : undefined;
  };
  const fifaRankOf = (code?: string | null): number | undefined => (code ? FIFA_RANK[code] : undefined);

  // The client islands take the RAW (code-keyed) payload and localize themselves via the i18n provider, so
  // every poll stays locale-agnostic. The server-rendered shell below uses a localized copy.
  const initial: MatchLivePayload = { m: foundRaw, summary, liveProbs, proj, hasLive };

  // Headshots for the players named in the match timeline (scorers, assisters, carded, subbed). Resolved
  // server-side (KV-cached) and keyed by "teamCode|name" for the timeline's mini avatars.
  const tlPlayers = new Map<string, { name: string; code: string }>();
  for (const e of summary.events) {
    if (!e.teamCode) continue;
    for (const nm of [e.player, e.assist, e.playerOff]) {
      if (nm) tlPlayers.set(`${e.teamCode}|${nm}`, { name: nm, code: e.teamCode });
    }
  }
  const playerImages: Record<string, string> = {};
  await Promise.all(
    [...tlPlayers.values()].map(async (p) => {
      const url = await getPlayerImage(p.name, p.code).catch(() => null);
      if (url) playerImages[`${p.code}|${p.name}`] = url;
    }),
  );
  const m = localizeMatch(foundRaw, t);
  const state: "final" | "live" | "defined" | "undefined" =
    m.status === "final" ? "final" : m.status === "live" ? "live" : m.defined ? "defined" : "undefined";

  // Is this one of the current watch-plan picks? (same scorer as the homepage "matches to watch")
  const heat = computeWatchability(all, data.teams, data.groups).byMatch.get(m.match);
  // Both teams' path-to-the-final odds, for the tournament-outlook comparison (only when both are known).
  const homeRaw = m.home ? data.teams.find((p) => p.code === m.home) : undefined;
  const awayRaw = m.away ? data.teams.find((p) => p.code === m.away) : undefined;
  const homePred = homeRaw ? localizeTeams([homeRaw], t)[0] : undefined;
  const awayPred = awayRaw ? localizeTeams([awayRaw], t)[0] : undefined;
  // Natural-language model read — only for an upcoming, fully-defined match (static, so precomputed here and
  // passed into the body; it disappears the moment the match kicks off).
  const proseText = state === "defined" && m.probs ? predictionProse(t, m, homePred?.rating, awayPred?.rating) : null;

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

  const matchLabel = t("match.matchLabel", {
    home: m.homeName ?? prettySlot(t, m.slotHome),
    away: m.awayName ?? prettySlot(t, m.slotAway),
  });
  // Breadcrumb parents are contextual: group matches sit under their Group; knockouts under the Bracket.
  const crumbs =
    m.round === "GROUP" && m.group
      ? [{ label: t("match.crumbHome"), href: localeHref(locale, "/") }, { label: t("nav.groups"), href: localeHref(locale, "/groups") }, { label: t("match.groupLabel", { group: m.group }), href: localeHref(locale, `/group/${m.group.toLowerCase()}`) }, { label: matchLabel }]
      : [{ label: t("match.crumbHome"), href: localeHref(locale, "/") }, { label: t("nav.bracket"), href: localeHref(locale, "/bracket") }, { label: roundName(t, m.round), href: localeHref(locale, "/bracket") }, { label: matchLabel }];
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
      <h1 className="sr-only">
        {t("match.srHeading", {
          home: m.homeName ?? prettySlot(t, m.slotHome),
          away: m.awayName ?? prettySlot(t, m.slotAway),
          round: roundName(t, m.round),
        })}
      </h1>
      <Breadcrumbs items={crumbs} />

      {/* The matchup IS the header — a big, full-width hero. Live-updating (score/clock/win-prob) via SWR. */}
      <MatchHero matchNo={m.match} initial={initial} iterations={data.iterations} homeRank={eloRankOf(m.home)} awayRank={eloRankOf(m.away)} homeFifa={fifaRankOf(m.home)} awayFifa={fifaRankOf(m.away)} />

      {/* Facts strip — the tail: a recessed well bonded to the hero. Live status/tickets via SWR. */}
      <MatchFacts matchNo={m.match} initial={initial} heat={heat} />

      {/* State-dependent body (prose / live win-prob / goals-cards-stats / provisional table) — live via SWR. */}
      <MatchBody matchNo={m.match} initial={initial} proseText={proseText} playerImages={playerImages} />

      {homePred && awayPred && <MatchOutlook round={m.round} home={homePred} away={awayPred} matches={all} />}

      <MatchPathForward m={m} matches={all} />

      <BracketPath m={m} all={all} />

      <ExploreSection links={exploreLinks}>
        {m.round === "GROUP" && groupView ? (
          <GroupStandingMini group={groupView.group} teams={groupView.teams} />
        ) : (
          <GroupsPreview groups={groups} />
        )}
        <BracketTeaser matches={all} teams={data.teams} />
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
