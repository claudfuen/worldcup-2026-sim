import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { pct } from "@/lib/format";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { LocalTime } from "@/components/local-time";
import { provisionalGroup, ratingsFromTeams } from "@/lib/liveProjection";
import { ProvisionalStandings } from "@/components/provisional-standings";
import { WinProbBar } from "@/components/win-prob-bar";
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
    return {
      title: { absolute: `${home} vs ${away} Prediction & Odds - World Cup 2026` },
      description: `Win probability, expected goals and likely scorelines for ${home} vs ${away} at the 2026 World Cup, from 20,000 Monte Carlo simulations.`,
      alternates: { canonical: `/match/${match}` },
    };
  } catch {
    return { title: `Match ${match}` };
  }
}

export default async function MatchPage({ params }: { params: Promise<{ match: string }> }) {
  const { match } = await params;
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const allMatches = overlayLive(data.matches, live);
  const m = allMatches.find((x) => x.match === Number(match));
  if (!m) notFound();
  const state: "final" | "live" | "defined" | "undefined" =
    m.status === "final" ? "final" : m.status === "live" ? "live" : m.defined ? "defined" : "undefined";

  // "If the live score holds" provisional group standings, for an in-progress group-stage match.
  const proj =
    state === "live" && m.group
      ? provisionalGroup(
          m.group,
          allMatches.filter((x) => x.round === "GROUP" && x.group === m.group),
          ratingsFromTeams(data.teams),
        )
      : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={state === "live"} />
      <h1 className="sr-only">
        {(m.homeName ?? prettySlot(m.slotHome))} vs {(m.awayName ?? prettySlot(m.slotAway))} prediction - World Cup 2026 {ROUND_NAME[m.round]}
      </h1>
      <Link href="/schedule" className="text-muted-foreground hover:text-foreground text-sm">← Schedule</Link>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground font-semibold">{ROUND_NAME[m.round]}{m.group ? ` · Group ${m.group}` : ""}</span>
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
                  <Flag code={mu.home} size={18} /><span className="truncate">{mu.homeName}</span>
                  <span className="text-muted-foreground text-xs">v</span>
                  <Flag code={mu.away} size={18} /><span className="flex-1 truncate">{mu.awayName}</span>
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
      <Flag code={resolved ?? null} size={44} />
      {resolved ? (
        <div className={`leading-tight font-semibold ${win ? "text-win" : ""}`}>{name}</div>
      ) : (
        <div className="min-w-0">
          <div className="text-foreground/80 truncate text-sm font-medium">{prettySlot(slot)}</div>
          {top && <div className="text-muted-2 mt-0.5 truncate text-xs">likely {top.name} {pct(Math.min(top.prob, 0.99))}</div>}
        </div>
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
            <Flag code={c.code} size={16} /><span className="flex-1 truncate">{c.name}</span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{pct(Math.min(c.prob, 0.99))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
