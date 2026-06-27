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
import { ProbMeter } from "@/components/prob-meter";
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

      {/* Top band: the matchup hero beside a match-facts rail — uses the width instead of a lonely column. */}
      <div className="mt-4 grid items-stretch gap-5 lg:grid-cols-5">
        {/* Hero: the matchup, with the model's win-probability built right in for an upcoming game. */}
        <div className="bg-surface-raised border-border-strong flex flex-col justify-center rounded-2xl border p-6 lg:col-span-3">
          <div className="flex items-center justify-center gap-2 sm:gap-5">
            <ScoreTeam m={m} side="home" />
            <div className="flex shrink-0 flex-col items-center gap-1.5 px-1">
              {m.status === "final" || m.status === "live" ? (
                <span className="font-display text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                  {m.homeScore}<span className="text-muted-2 mx-1.5">–</span>{m.awayScore}
                </span>
              ) : (
                <span className="text-muted-foreground font-display text-2xl">vs</span>
              )}
              {m.status === "final" ? (
                <span className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Full time</span>
              ) : m.status === "live" ? (
                <span className="text-live inline-flex items-center gap-1.5 text-xs font-semibold">
                  <span className="bg-live size-1.5 animate-pulse rounded-full" />{m.liveDetail}
                </span>
              ) : null}
            </div>
            <ScoreTeam m={m} side="away" />
          </div>
          {state === "defined" && m.probs && (
            <div className="border-border/60 mt-5 border-t pt-4">
              <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
              {m.round !== "GROUP" && <p className="text-muted-2 mt-3 text-xs">Regulation odds; knockout ties are settled by extra time and penalties.</p>}
            </div>
          )}
        </div>

        {/* Match facts rail */}
        <aside className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border lg:col-span-2">
          <FactRow label="Kickoff" value={<LocalTime utc={m.utc} mode="datetime" />} />
          <FactRow label="Venue" value={`${m.venue}, ${m.city}`} />
          <FactRow label="Stage" value={
            <>
              {m.round === "GROUP" && m.group ? (
                <>Group stage · <Link href={`/group/${m.group.toLowerCase()}`} className="hover:text-primary underline-offset-2 hover:underline">Group {m.group}</Link></>
              ) : (
                <Link href="/bracket" className="hover:text-primary underline-offset-2 hover:underline">{ROUND_NAME[m.round]}</Link>
              )}
              <span className="text-muted-2"> · Match {m.match}</span>
            </>
          } />
          <FactRow label="Status" value={state === "final" ? "Full time" : state === "live" ? `Live · ${m.liveDetail}` : "Upcoming"} />
          {heat?.hot && <FactRow label="Worth watching" value={heat.reason} />}
          {state !== "final" && state !== "live" && hasTickets(m.match) && (
            <div className="p-3">
              <TicketLink matchNo={m.match} placement="match_facts" variant="button" />
              <p className="text-muted-2 mt-1.5 text-center text-[10px]">Resale via {TICKET_PROVIDER} · opens in a new tab</p>
            </div>
          )}
        </aside>
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

      {state === "undefined" && (
        <section className="mt-6">
          <h2 className="text-muted-foreground mb-2 font-mono text-xs font-semibold tracking-wide uppercase">Who fills each slot</h2>
          <div className="border-border bg-card flex rounded-2xl border">
            <div className="min-w-0 flex-1 p-4 sm:p-5"><SlotColumn slot={m.slotHome} resolved={m.home} name={m.homeName} cands={m.projHome} /></div>
            <div className="border-border/50 min-w-0 flex-1 border-l p-4 sm:p-5"><SlotColumn slot={m.slotAway} resolved={m.away} name={m.awayName} cands={m.projAway} /></div>
          </div>
          <p className="text-muted-2 mt-2 text-xs">How likely each contender is to fill the slot, across {data.iterations.toLocaleString()} simulations.</p>
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

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span className="text-muted-2 shrink-0 font-mono text-[10px] font-semibold tracking-wide uppercase">{label}</span>
      <span className="text-foreground/90 min-w-0 text-right text-sm">{value}</span>
    </div>
  );
}

function ScoreTeam({ m, side }: { m: MatchInfo; side: "home" | "away" }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const top = (side === "home" ? m.projHome : m.projAway)?.[0];
  const hasScore = m.status === "final" || m.status === "live";
  const score = hasScore ? (side === "home" ? m.homeScore : m.awayScore) : undefined;
  const other = hasScore ? (side === "home" ? m.awayScore : m.homeScore) : undefined;
  // The advancing team: ESPN's winner flag when present (covers penalty wins, where the score is level),
  // else the higher score. Never marked while live.
  const win = m.status === "final" && (m.winner ? m.winner === resolved : score != null && other != null && score > other);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      {resolved && name ? (
        <Link href={`/team/${teamSlug(name)}`} className="flex flex-col items-center gap-2 hover:underline">
          <Flag code={resolved} size={44} />
          <div className={`leading-tight font-semibold ${win ? "text-win" : ""}`}>{name}</div>
        </Link>
      ) : (
        <>
          {/* Unresolved slot: show the model's most-likely occupant's flag, dimmed, instead of an empty box. */}
          <span className={top ? "opacity-65" : ""}><Flag code={top?.code ?? null} size={44} /></span>
          <div className="min-w-0">
            <div className="text-foreground/80 truncate text-sm font-medium">{prettySlot(slot)}</div>
            {top && <div className="text-muted-2 mt-0.5 truncate text-xs">likely {top.name} {pct(Math.min(top.prob, 0.99))}</div>}
          </div>
        </>
      )}
    </div>
  );
}

// One side of an unconfirmed match: a clinched team rendered editorial (flag + bold name + ✓), or the
// race for the slot — the top contenders with prob bars, mirroring the bracket's contender stack.
function SlotColumn({ slot, resolved, name, cands }: { slot?: string; resolved: string | null; name: string | null; cands?: { code: string; name: string; prob: number }[] }) {
  if (resolved && name) {
    return (
      <div>
        <div className="text-muted-2 mb-2.5 font-mono text-[10px] font-semibold tracking-wide uppercase">Confirmed</div>
        <Link href={`/team/${teamSlug(name)}`} className="flex items-center gap-2.5 hover:underline">
          <Flag code={resolved} size={28} />
          <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
          <span className="text-win shrink-0 text-sm font-bold" title="Confirmed">✓</span>
        </Link>
      </div>
    );
  }
  const list = (cands ?? []).filter((c) => c.prob >= 0.03).slice(0, 4);
  const shown = list.length ? list : (cands ?? []).slice(0, 1);
  return (
    <div>
      <div className="text-muted-2 mb-2.5 truncate font-mono text-[10px] font-semibold tracking-wide uppercase">{prettySlot(slot)}</div>
      <div className="space-y-2">
        {shown.length === 0 ? (
          <span className="text-muted-2 text-sm">TBD</span>
        ) : (
          shown.map((c) => (
            <Link key={c.code} href={`/team/${teamSlug(c.name)}`} className="flex items-center gap-2 text-sm hover:underline">
              <Flag code={c.code} size={18} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <ProbMeter p={c.prob} width={36} className="text-muted-foreground shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
