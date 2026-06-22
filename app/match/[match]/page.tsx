import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { etDateTime, pct } from "@/lib/format";
import { MatchFlagButton } from "@/components/match-flag-button";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { getSessionUser, getUserMatchNumbers } from "@/lib/userMatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROUND_NAME: Record<string, string> = {
  GROUP: "Group stage", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3P": "Third-place play-off", FINAL: "Final",
};

export default async function MatchPage({ params }: { params: Promise<{ match: string }> }) {
  const { match } = await params;
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const base = data.matches.find((x) => x.match === Number(match));
  if (!base) notFound();
  const m = overlayLive([base], live)[0];
  const user = await getSessionUser();
  const hasTicket = user ? (await getUserMatchNumbers(user.id)).includes(m.match) : false;
  const state: "final" | "live" | "defined" | "undefined" =
    m.status === "final" ? "final" : m.status === "live" ? "live" : m.defined ? "defined" : "undefined";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <LiveAutoRefresh enabled={state === "live"} />
      <Link href="/schedule" className="text-muted-foreground hover:text-foreground text-sm">← Schedule</Link>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground font-semibold">{ROUND_NAME[m.round]}{m.group ? ` · Group ${m.group}` : ""}</span>
        <span className="text-muted-foreground">Match {m.match}</span>
        <MatchFlagButton matchNo={m.match} initialOn={hasTicket} isAuthed={Boolean(user)} variant="button" />
      </div>
      <div className="text-muted-foreground mt-1 text-sm">{etDateTime(m.utc)} · {m.venue}, {m.city}</div>

      {/* Matchup header */}
      <div className="border-border bg-card mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border p-6">
        <SideHeader m={m} side="home" />
        <div className="text-center text-xs">
          {m.status === "final" ? (
            <span className="text-muted-foreground">FT</span>
          ) : m.status === "live" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-red-400">
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" />{m.liveDetail}
            </span>
          ) : (
            <span className="text-muted-foreground">vs</span>
          )}
        </div>
        <SideHeader m={m} side="away" right />
      </div>

      {/* State-specific body */}
      {state === "final" && (
        <section className="mt-6">
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold font-mono tracking-wide uppercase">Model&apos;s pre-match read</h2>
          <div className="border-border bg-card space-y-3 rounded-2xl border p-5">
            {m.probs ? (
              <>
                <ProbRow label={m.homeName!} value={m.probs.home} />
                <ProbRow label="Draw" value={m.probs.draw} tone="muted" />
                <ProbRow label={m.awayName!} value={m.probs.away} />
                <p className="text-muted-foreground/70 pt-1 text-xs">
                  {m.xg && <>Expected goals {m.xg.home.toFixed(1)}–{m.xg.away.toFixed(1)} · </>}
                  actual result <span className="text-foreground/80">{m.homeScore}–{m.awayScore}</span>.
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
          <div className="border-border bg-card space-y-3 rounded-2xl border p-5">
            {state === "live" && (
              <p className="text-red-400 pb-1 text-xs font-medium">
                Live: {m.homeName} {m.homeScore}–{m.awayScore} {m.awayName} · {m.liveDetail}
              </p>
            )}
            <ProbRow label={m.homeName!} value={m.probs.home} />
            <ProbRow label="Draw" value={m.probs.draw} tone="muted" />
            <ProbRow label={m.awayName!} value={m.probs.away} />
            {state === "live" ? (
              <p className="text-muted-foreground/70 pt-1 text-xs">The forecast updates once the match is final.</p>
            ) : m.round !== "GROUP" ? (
              <p className="text-muted-foreground/70 pt-1 text-xs">Regulation result; knockout ties are decided by extra time and penalties.</p>
            ) : null}
          </div>
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
                  <div className="bg-emerald-500/70 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(s.prob / m.topScores![0].prob) * 100}%` }} />
                </div>
                <span className="text-muted-foreground w-10 text-right font-mono text-xs tabular-nums">{pct(s.prob)}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground/60 mt-2 text-xs">
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
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

function SideHeader({ m, side, right }: { m: MatchInfo; side: "home" | "away"; right?: boolean }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const top = (side === "home" ? m.projHome : m.projAway)?.[0];
  const hasScore = m.status === "final" || m.status === "live";
  const score = hasScore ? (side === "home" ? m.homeScore : m.awayScore) : undefined;
  const other = hasScore ? (side === "home" ? m.awayScore : m.homeScore) : undefined;
  const win = m.status === "final" && score != null && other != null && score > other; // no "winner" while live
  return (
    <div className={`flex items-center gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
      <Flag code={resolved ?? null} size={40} />
      <div>
        {resolved ? (
          <div className={`text-lg font-semibold ${win ? "text-emerald-400" : ""}`}>{name}</div>
        ) : (
          <>
            <div className="text-foreground/70 text-base font-medium">{prettySlot(slot)}</div>
            {top && <div className="text-muted-foreground text-xs">likely {top.name} {pct(Math.min(top.prob, 0.99))}</div>}
          </>
        )}
        {score != null && <div className="font-mono text-3xl font-bold tabular-nums">{score}</div>}
      </div>
    </div>
  );
}

function ProbRow({ label, value, tone }: { label: string; value: number; tone?: "muted" }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm font-medium">{label}</span>
      <div className="bg-muted/40 relative h-2 flex-1 overflow-hidden rounded-full">
        <div className={`absolute inset-y-0 left-0 rounded-full ${tone === "muted" ? "bg-muted-foreground/50" : "bg-emerald-500"}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-sm tabular-nums">{pct(value)}</span>
    </div>
  );
}

function Candidates({ title, list }: { title: string; list?: { code: string; name: string; prob: number }[] }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <div className="text-muted-foreground mb-2 text-[10px] font-mono tracking-wide uppercase">Likely · {title}</div>
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
