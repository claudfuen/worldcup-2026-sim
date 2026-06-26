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
import { ShareBar } from "@/components/share-bar";

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {eventLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventLd) }} />}
      <LiveAutoRefresh enabled={liveActivity(data.matches.filter((x) => x.match === m.match), live)} />
      <h1 className="sr-only">
        {(m.homeName ?? prettySlot(m.slotHome))} vs {(m.awayName ?? prettySlot(m.slotAway))} prediction - World Cup 2026 {ROUND_NAME[m.round]}
      </h1>
      <Link href="/schedule" className="text-muted-foreground hover:text-foreground text-sm">← Schedule</Link>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground font-semibold">{ROUND_NAME[m.round]}</span>
        {m.group && (
          <Link href={`/group/${m.group.toLowerCase()}`} className="text-foreground hover:text-primary font-semibold hover:underline">
            Group {m.group}
          </Link>
        )}
        <span className="text-muted-2">Match {m.match}</span>
      </div>
      <div className="text-muted-foreground mt-1 text-sm"><LocalTime utc={m.utc} mode="datetime" /> · {m.venue}, {m.city}</div>

      {/* Scoreboard header: teams flank a centered score (no dead center void) */}
      <div className="bg-surface-raised border-border-strong mt-6 flex items-center justify-center gap-2 rounded-2xl border p-6 sm:gap-5">
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

      <div className="mt-4 flex justify-center">
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
        <p className="text-muted-foreground mt-6 text-sm text-pretty">{predictionProse(m)}</p>
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

      {(state === "defined" || state === "live") && m.probs && (
        <section className="mt-6">
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold font-mono tracking-wide uppercase">
            {state === "live" ? "Pre-match win probability" : "Win probability"}
          </h2>
          <div className="border-border bg-card rounded-2xl border p-4">
            {state === "live" && (
              <p className="text-live mb-3 text-xs font-medium">
                Live: {m.homeName} {m.homeScore}–{m.awayScore} {m.awayName} · {m.liveDetail}
              </p>
            )}
            <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={m.homeName!} awayName={m.awayName!} />
            {state === "live" ? (
              <p className="text-muted-2 mt-4 text-xs">The full tournament forecast updates once the match is final.</p>
            ) : m.round !== "GROUP" ? (
              <p className="text-muted-2 mt-4 text-xs">Regulation result; knockout ties are decided by extra time and penalties.</p>
            ) : null}
          </div>
        </section>
      )}

      {homePred && awayPred && <MatchOutlook round={m.round} home={homePred} away={awayPred} />}

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
            {m.topScores.map((s, i) => (
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
        <>
          <section className="mt-6">
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold font-mono tracking-wide uppercase">Most likely matchups</h2>
            <div className="border-border bg-card divide-border/50 divide-y rounded-2xl border">
              {(m.topMatchups ?? []).map((mu) => (
                <div key={`${mu.home}|${mu.away}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <Link href={`/team/${teamSlug(mu.homeName)}`} className="flex items-center gap-2 hover:underline"><Flag code={mu.home} size={18} /><span className="truncate">{mu.homeName}</span></Link>
                  <span className="text-muted-foreground text-xs">v</span>
                  <Link href={`/team/${teamSlug(mu.awayName)}`} className="flex flex-1 items-center gap-2 hover:underline"><Flag code={mu.away} size={18} /><span className="truncate">{mu.awayName}</span></Link>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">{pct(mu.prob)}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!m.home && <Candidates title={prettySlot(m.slotHome)} list={m.projHome} />}
            {!m.away && <Candidates title={prettySlot(m.slotAway)} list={m.projAway} />}
          </div>
        </>
      )}
    </main>
  );
}

// Natural-language model read for an upcoming, fully-defined match: unique per-page prose that answers
// "who does the model favour and how" - the snippet a search result wants. Percentages cap at 99% (a
// single match is a forecast, never a certainty), matching the rest of the site.
function predictionProse(m: MatchInfo): string {
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
  return `The model makes ${favName} the ${favPct}% favorite to beat ${dogName}, with a ${cap(draw)}% chance of a draw, across 20,000 simulations.${scoreStr}`;
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

function ScoreTeam({ m, side }: { m: MatchInfo; side: "home" | "away" }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const top = (side === "home" ? m.projHome : m.projAway)?.[0];
  const hasScore = m.status === "final" || m.status === "live";
  const score = hasScore ? (side === "home" ? m.homeScore : m.awayScore) : undefined;
  const other = hasScore ? (side === "home" ? m.awayScore : m.homeScore) : undefined;
  const win = m.status === "final" && score != null && other != null && score > other; // no "winner" while live
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      {resolved && name ? (
        <Link href={`/team/${teamSlug(name)}`} className="flex flex-col items-center gap-2 hover:underline">
          <Flag code={resolved} size={44} />
          <div className={`leading-tight font-semibold ${win ? "text-win" : ""}`}>{name}</div>
        </Link>
      ) : (
        <>
          <Flag code={resolved ?? null} size={44} />
          <div className="min-w-0">
            <div className="text-foreground/80 truncate text-sm font-medium">{prettySlot(slot)}</div>
            {top && <div className="text-muted-2 mt-0.5 truncate text-xs">likely {top.name} {pct(Math.min(top.prob, 0.99))}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function Candidates({ title, list }: { title: string; list?: { code: string; name: string; prob: number }[] }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <div className="text-muted-foreground mb-2 font-mono text-[10px] font-semibold tracking-wide uppercase">Likely · {title}</div>
      <div className="space-y-1.5">
        {(list ?? []).slice(0, 5).map((c) => (
          <div key={c.code} className="flex items-center gap-2 text-sm">
            <Link href={`/team/${teamSlug(c.name)}`} className="flex flex-1 items-center gap-2 hover:underline"><Flag code={c.code} size={16} /><span className="truncate">{c.name}</span></Link>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{pct(Math.min(c.prob, 0.99))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
