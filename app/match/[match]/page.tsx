import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { teamSlug } from "@/lib/slug";
import { pct } from "@/lib/format";
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
import { Breadcrumbs } from "@/components/breadcrumbs";
import { type RelLink } from "@/components/related-links";
import { ExploreSection } from "@/components/explore-section";
import { GroupStandingMini } from "@/components/group-standing-mini";
import { BracketTeaser } from "@/components/bracket-teaser";
import { GroupsPreview } from "@/components/groups-preview";
import { TitleOdds } from "@/components/title-odds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROUND_NAME: Record<string, string> = {
  GROUP: "Group stage", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3P": "Third-place play-off", FINAL: "Final",
};

export async function generateMetadata({ params }: { params: Promise<{ match: string }> }) {
  const { match } = await params;
  try {
    const data = await getPredictions();
    const m = data.matches.find((x) => x.match === Number(match));
    if (!m) return { title: `Match ${match}` };
    const home = m.homeName ?? (m.slotHome ? prettySlot(m.slotHome) : "TBD");
    const away = m.awayName ?? (m.slotAway ? prettySlot(m.slotAway) : "TBD");
    const title = `${home} vs ${away} Prediction & Odds - World Cup 2026`;
    const description = `Win probability, expected goals and likely scorelines for ${home} vs ${away} at the 2026 World Cup, from 20,000 Monte Carlo simulations.`;
    return {
      title: { absolute: title },
      description,
      alternates: { canonical: `/match/${m.match}` },
      openGraph: { title, description, url: `/match/${m.match}`, type: "article" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return { title: `Match ${match}` };
  }
}

export default async function MatchPage({ params }: { params: Promise<{ match: string }> }) {
  const { match } = await params;
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  // Lock this match's participants the instant the feeding group(s) decide, ahead of the cron.
  const hasLive = liveActivity(data.matches, live);
  const ratings = ratingsFromTeams(data.teams);
  const allMatches = hasLive ? finalizeBracket(overlaid, finalizeGroups(data.groups, overlaid, ratings), ratings) : overlaid;
  const m = allMatches.find((x) => x.match === Number(match));
  if (!m) notFound();
  const state: "final" | "live" | "defined" | "undefined" =
    m.status === "final" ? "final" : m.status === "live" ? "live" : m.defined ? "defined" : "undefined";
  // Is this one of the current watch-plan picks? (same scorer as the homepage "matches to watch")
  const heat = computeWatchability(allMatches, data.teams, data.groups).byMatch.get(m.match);
  // Both teams' path-to-the-final odds, for the tournament-outlook comparison (only when both are known).
  const homePred = m.home ? data.teams.find((t) => t.code === m.home) : undefined;
  const awayPred = m.away ? data.teams.find((t) => t.code === m.away) : undefined;
  // SportsEvent structured data - only for a real, named matchup (slot placeholders aren't teams).
  const eventLd =
    m.defined && m.homeName && m.awayName
      ? {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: `${m.homeName} vs ${m.awayName} - World Cup 2026 ${ROUND_NAME[m.round]}${m.group ? ` (Group ${m.group})` : ""}`,
          sport: "Association football",
          startDate: m.utc,
          eventStatus: "https://schema.org/EventScheduled",
          location: { "@type": "Place", name: m.venue, address: m.city },
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

  const matchLabel = `${m.homeName ?? prettySlot(m.slotHome)} v ${m.awayName ?? prettySlot(m.slotAway)}`;
  // Breadcrumb parents are contextual: group matches sit under their Group; knockouts under the Bracket.
  const crumbs =
    m.round === "GROUP" && m.group
      ? [{ label: "Home", href: "/" }, { label: "Groups", href: "/groups" }, { label: `Group ${m.group}`, href: `/group/${m.group.toLowerCase()}` }, { label: matchLabel }]
      : [{ label: "Home", href: "/" }, { label: "Bracket", href: "/bracket" }, { label: ROUND_NAME[m.round], href: "/bracket" }, { label: matchLabel }];
  // Live-finalized standings for the explore-section group preview (a window into the match's own group).
  const groups = hasLive ? finalizeGroups(data.groups, overlaid, ratings) : data.groups;
  const groupView = m.group ? groups.find((g) => g.group === m.group) : undefined;
  // Secondary pill links beneath the preview cards: both teams (so non-top-6 sides stay reachable) + schedule.
  const exploreLinks: RelLink[] = [];
  if (m.home && m.homeName) exploreLinks.push({ label: m.homeName, href: `/team/${teamSlug(m.homeName)}`, code: m.home });
  if (m.away && m.awayName) exploreLinks.push({ label: m.awayName, href: `/team/${teamSlug(m.awayName)}`, code: m.away });
  exploreLinks.push({ label: "Full schedule", href: "/schedule" });
  exploreLinks.push({ label: "How it works", href: "/methodology" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {eventLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventLd) }} />}
      <LiveAutoRefresh enabled={liveActivity(data.matches.filter((x) => x.match === m.match), live)} />
      <h1 className="sr-only">
        {(m.homeName ?? prettySlot(m.slotHome))} vs {(m.awayName ?? prettySlot(m.slotAway))} prediction - World Cup 2026 {ROUND_NAME[m.round]}
      </h1>
      <Breadcrumbs items={crumbs} />

      {/* The matchup IS the header — a big, full-width hero. Supporting facts/odds form the "tail" below.
          A resolved tie shows the teams + score/win-prob; a PREDICTED tie shows each slot's contender race
          inline (like the bracket cards) — no thin "likely X%" + redundant repeat. */}
      <section className="bg-surface-raised border-border-strong mt-5 rounded-2xl border px-5 py-7 sm:px-10 sm:py-9">
        {state === "undefined" ? (
          <div className="flex items-start justify-center gap-5 sm:gap-12">
            <HeroSlot m={m} side="home" />
            <span className="text-muted-foreground font-display self-center text-3xl sm:text-4xl" aria-hidden>v</span>
            <HeroSlot m={m} side="away" />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-5 sm:gap-12">
            <ScoreTeam m={m} side="home" />
            <div className="flex shrink-0 flex-col items-center gap-2 px-1">
              {state === "final" || state === "live" ? (
                <span className="font-display text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
                  {m.homeScore}<span className="text-muted-2 mx-1.5 font-normal">–</span>{m.awayScore}
                </span>
              ) : (
                <span className="text-muted-foreground font-display text-3xl sm:text-4xl">v</span>
              )}
              {state === "final" ? (
                <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-wide uppercase">Full time</span>
              ) : state === "live" ? (
                <span className="text-live inline-flex items-center gap-1.5 text-xs font-semibold">
                  <span className="bg-live size-1.5 animate-pulse rounded-full" />{m.liveDetail}
                </span>
              ) : (
                <span className="text-muted-2 font-mono text-[11px] tracking-wide uppercase" suppressHydrationWarning><LocalTime utc={m.utc} mode="day" /></span>
              )}
            </div>
            <ScoreTeam m={m} side="away" />
          </div>
        )}
        {state === "defined" && m.probs && (
          <div className="border-border/60 mx-auto mt-6 max-w-xl border-t pt-5">
            <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
            {m.round !== "GROUP" && <p className="text-muted-2 mt-3 text-center text-xs">Regulation odds; knockout ties are settled by extra time and penalties.</p>}
          </div>
        )}
        {state === "undefined" && (
          <p className="text-muted-2 border-border/60 mx-auto mt-7 max-w-2xl border-t pt-4 text-center text-xs text-pretty">
            The model&apos;s most likely team for each slot, across {data.iterations.toLocaleString()} simulations.
          </p>
        )}
      </section>

      {/* Facts strip — the tail: kickoff, venue, stage, watchability, and the ticket CTA. */}
      <div className="border-border bg-card mt-4 rounded-2xl border p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Fact label="Kickoff" value={<LocalTime utc={m.utc} mode="datetime" />} />
          <Fact label="Venue" value={`${m.venue}, ${m.city}`} />
          <Fact label="Stage" value={
            <>
              {m.round === "GROUP" && m.group ? (
                <Link href={`/group/${m.group.toLowerCase()}`} className="hover:text-primary underline-offset-2 hover:underline">Group {m.group}</Link>
              ) : (
                <Link href="/bracket" className="hover:text-primary underline-offset-2 hover:underline">{ROUND_NAME[m.round]}</Link>
              )}
              <span className="text-muted-2"> · M{m.match}</span>
            </>
          } />
          <Fact label={heat?.hot ? "Worth watching" : "Status"} value={heat?.hot ? heat.reason : state === "final" ? "Full time" : state === "live" ? "Live now" : "Upcoming"} />
        </div>
        {state !== "final" && state !== "live" && hasTickets(m.match) && (
          <div className="border-border/50 mt-4 flex flex-col gap-2.5 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-2 text-xs">Tickets on the {TICKET_PROVIDER} resale market · opens in a new tab</p>
            <TicketLink matchNo={m.match} placement="match_facts" variant="button" className="sm:w-auto sm:px-5" />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-center">
        <ShareBar
          text={
            state === "final"
              ? `${m.homeName} ${m.homeScore}-${m.awayScore} ${m.awayName} - World Cup 2026 ${ROUND_NAME[m.round]}.`
              : m.favorite && m.home && m.away
                ? `${m.favorite.name} ${Math.round(m.favorite.winProb * 100)}% to win - ${m.homeName} vs ${m.awayName} World Cup 2026 prediction.`
                : `${m.homeName ?? prettySlot(m.slotHome)} vs ${m.awayName ?? prettySlot(m.slotAway)} - World Cup 2026 prediction.`
          }
          path={`/match/${m.match}`}
        />
      </div>

      {state === "defined" && m.probs && (
        <p className="text-muted-foreground mt-6 max-w-3xl text-sm text-pretty">{predictionProse(m, homePred?.rating, awayPred?.rating)}</p>
      )}

      {/* State-specific body */}
      {state === "final" && (
        <section className="mt-6">
          <h2 className="text-muted-foreground mb-2 font-mono text-xs font-semibold tracking-wide uppercase">Model&apos;s pre-match read</h2>
          <div className="border-border bg-card rounded-2xl border p-4">
            {m.probs ? (
              <>
                <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
                <p className="text-muted-2 mt-4 text-xs">
                  {m.xg && <>Expected goals {m.xg.home.toFixed(1)}–{m.xg.away.toFixed(1)} · </>}
                  actual result <span className="text-foreground/80 font-medium">{m.homeScore}–{m.awayScore}</span>.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Full time: <span className="text-foreground font-medium">{m.homeName} {m.homeScore}–{m.awayScore} {m.awayName}</span>.
              </p>
            )}
          </div>
        </section>
      )}

      {state === "live" && m.probs && (
        <section className="mt-6">
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold font-mono tracking-wide uppercase">
            Pre-match win probability
          </h2>
          <div className="border-border bg-card rounded-2xl border p-4">
            <p className="text-live mb-3 text-xs font-medium">
              Live: {m.homeName} {m.homeScore}–{m.awayScore} {m.awayName} · {m.liveDetail}
            </p>
            <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
            <p className="text-muted-2 mt-4 text-xs">The full tournament forecast updates once the match is final.</p>
          </div>
        </section>
      )}

      {homePred && awayPred && <MatchOutlook round={m.round} home={homePred} away={awayPred} />}

      <BracketPath m={m} all={allMatches} />

      {proj && (
        <section className="mt-6">
          <h2 className="text-muted-foreground mb-2 font-mono text-xs font-semibold tracking-wide uppercase">
            Group {proj.group} if it ends like this
          </h2>
          <ProvisionalStandings proj={proj} />
        </section>
      )}

      {state === "defined" && m.topScores && m.topScores.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-muted-foreground text-xs font-semibold font-mono tracking-wide uppercase">Most likely scorelines</h2>
            {m.xg && <span className="text-muted-foreground text-xs">xG {m.xg.home.toFixed(1)} – {m.xg.away.toFixed(1)}</span>}
          </div>
          <div className="border-border bg-card divide-border/50 divide-y rounded-2xl border">
            {m.topScores.map((s) => (
              <div key={`${s.h}-${s.a}`} className="flex items-center gap-2.5 px-4 py-2.5">
                <Flag code={m.home} size={16} />
                <span className="w-10 font-mono text-sm font-bold tabular-nums">{s.h}–{s.a}</span>
                <Flag code={m.away} size={16} />
                <div className="bg-muted/40 relative ml-1 h-1.5 flex-1 overflow-hidden rounded-full">
                  <div className="bg-primary/70 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(s.prob / m.topScores![0].prob) * 100}%` }} />
                </div>
                <span className="text-muted-foreground w-10 text-right font-mono text-xs tabular-nums">{pct(s.prob)}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-2 mt-2 text-xs">
            Top {m.topScores.length} of every possible scoreline · all other scorelines{" "}
            {pct(Math.max(0, 1 - m.topScores.reduce((acc, s) => acc + s.prob, 0)))} combined.
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
function predictionProse(m: MatchInfo, homeRating?: number, awayRating?: number): string {
  const { home, draw, away } = m.probs!;
  const cap = (v: number) => Math.max(1, Math.round(Math.min(v, 0.99) * 100));
  const favHome = home >= away;
  const favName = favHome ? m.homeName : m.awayName;
  const dogName = favHome ? m.awayName : m.homeName;
  const favPct = cap(favHome ? home : away);
  const top = m.topScores?.[0];
  const scoreStr = top
    ? ` The most likely scoreline is ${m.homeName} ${top.h}-${top.a} ${m.awayName}${m.xg ? ` (expected goals ${m.xg.home.toFixed(1)}-${m.xg.away.toFixed(1)})` : ""}.`
    : "";
  let whyStr = "";
  if (homeRating != null && awayRating != null) {
    const gap = Math.round(homeRating - awayRating);
    const abs = Math.abs(gap);
    whyStr = abs >= 25
      ? ` That edge comes from the ratings: ${gap >= 0 ? m.homeName : m.awayName} are about ${abs} Elo points stronger.`
      : ` The two sides are within ${abs} Elo points, so the model sees a tight game.`;
  }
  return `The model makes ${favName} the ${favPct}% favorite to beat ${dogName}, with ${artForPct(cap(draw))} ${cap(draw)}% chance of a draw, across 20,000 simulations.${scoreStr}${whyStr}`;
}

// "a" vs "an" before a spoken percentage: 8, 11, 18 and 80-89 ("eight", "eleven", "eighteen", "eighty…")
// begin with a vowel sound, so they take "an"; every other 1-99 value takes "a".
function artForPct(n: number): string {
  return n === 8 || n === 11 || n === 18 || (n >= 80 && n <= 89) ? "an" : "a";
}

function prettySlot(s?: string): string {
  if (!s) return "TBD";
  if (/^1[A-L]$/.test(s)) return `Winner ${s[1]}`;
  if (/^2[A-L]$/.test(s)) return `Runner-up ${s[1]}`;
  if (s.startsWith("3:")) return `3rd: ${s.slice(2).split(",").join("/")}`;
  if (s.startsWith("W")) return `Winner of M${s.slice(1)}`;
  if (s.startsWith("L")) return `Loser of M${s.slice(1)}`;
  return s;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-2 mb-1 font-mono text-[10px] font-semibold tracking-wide uppercase">{label}</div>
      <div className="text-foreground/90 text-sm leading-snug">{value}</div>
    </div>
  );
}

// One side of a RESOLVED matchup (defined/live/final): flag + team name, linking to the team page. The
// winner is tinted green, the loser muted. Predicted (unresolved) ties use <HeroSlot> instead.
function ScoreTeam({ m, side }: { m: MatchInfo; side: "home" | "away" }) {
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
        <div className="text-muted-2 text-sm">TBD</div>
      </div>
    );
  }
  return (
    <Link href={`/team/${teamSlug(name)}`} className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center transition-opacity hover:opacity-80">
      <Flag code={resolved} size={64} />
      <div className={`font-display text-xl leading-tight font-semibold text-balance sm:text-2xl ${win ? "text-win" : lose ? "text-muted-foreground" : ""}`}>{name}</div>
    </Link>
  );
}

// One side of a PREDICTED matchup hero. Mirrors the settled side (big flag + name) so both heroes feel
// the same, but the headline is the projected team's chance of filling this slot — with a probability bar
// and the next-most-likely alternate beneath. A clinched side (partially-decided tie) shows a ✓ instead.
function HeroSlot({ m, side }: { m: MatchInfo; side: "home" | "away" }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const cands = (side === "home" ? m.projHome : m.projAway) ?? [];

  if (resolved && name) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center">
        <div className="text-muted-2 max-w-full truncate font-mono text-[10px] font-semibold tracking-wide uppercase">{prettySlot(slot)}</div>
        <Link href={`/team/${teamSlug(name)}`} className="flex flex-col items-center gap-3 transition-opacity hover:opacity-80">
          <Flag code={resolved} size={64} />
          <div className="font-display text-xl leading-tight font-semibold text-balance sm:text-2xl">{name}</div>
        </Link>
        <div className="text-win inline-flex items-center gap-1 font-mono text-[11px] font-semibold tracking-wide uppercase">✓ Confirmed</div>
      </div>
    );
  }

  const top = cands[0];
  if (!top) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3 text-center">
        <div className="text-muted-2 max-w-full truncate font-mono text-[10px] font-semibold tracking-wide uppercase">{prettySlot(slot)}</div>
        <Flag code={null} size={64} />
        <div className="text-muted-2 text-sm">To be decided</div>
      </div>
    );
  }
  // The projected occupant is shown big; the next three contenders sit beneath as "if not" alternates.
  const rest = cands.slice(1).filter((c) => c.prob >= 0.02).slice(0, 3);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center">
      <div className="text-muted-2 max-w-full truncate font-mono text-[10px] font-semibold tracking-wide uppercase">{prettySlot(slot)}</div>
      <Link href={`/team/${teamSlug(top.name)}`} className="flex flex-col items-center gap-3 transition-opacity hover:opacity-80">
        <Flag code={top.code} size={64} />
        <div className="font-display text-xl leading-tight font-semibold text-balance sm:text-2xl">{top.name}</div>
      </Link>
      <div className="w-full max-w-[11rem]">
        <div className="bg-muted/50 h-1.5 overflow-hidden rounded-full">
          <div className="bg-primary/80 h-full rounded-full" style={{ width: `${Math.round(Math.min(top.prob, 0.99) * 100)}%` }} />
        </div>
        <div className="text-foreground/90 mt-2 font-mono text-sm font-semibold tabular-nums">{pct(Math.min(top.prob, 0.99))} <span className="text-muted-2 font-normal">to reach</span></div>
      </div>
      {rest.length > 0 && (
        <div className="border-border/50 mt-1 w-full max-w-[11rem] space-y-1.5 border-t pt-3">
          <div className="text-muted-2 font-mono text-[9px] font-semibold tracking-wide uppercase">If not</div>
          {rest.map((r) => (
            <Link key={r.code} href={`/team/${teamSlug(r.name)}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors">
              <Flag code={r.code} size={14} />
              <span className="min-w-0 flex-1 truncate text-left">{r.name}</span>
              <span className="shrink-0 font-mono tabular-nums">{pct(Math.min(r.prob, 0.99))}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
