"use client";
import { useState } from "react";
import Link from "next/link";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { Countdown } from "@/components/countdown";
import { ShareBar } from "@/components/share-bar";
import { WinProbBar } from "@/components/win-prob-bar";
import { MatchStats } from "@/components/match-stats";
import { MatchTimeline } from "@/components/match-timeline";
import { ProvisionalStandings } from "@/components/provisional-standings";
import { slugForCode } from "@/lib/slug";
import { pct, forecastPct } from "@/lib/format";
import { fifaVenue } from "@/lib/venues";
import { VENUE_BY_KEY } from "@/lib/data/venues";
import { decidedOnPens, pensScore } from "@/lib/penalties";
import { PenaltyShootout } from "@/components/penalty-shootout";
import { TicketLink } from "@/components/ticket-link";
import { hasTickets, TICKET_PROVIDER } from "@/lib/tickets";
import type { MatchInfo } from "@/lib/predictions";
import type { MatchLivePayload } from "@/lib/matchLive";
import type { WatchPick } from "@/lib/watchability";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { useLivePoll } from "@/lib/useLivePoll";

type State = "final" | "live" | "defined" | "undefined";

// How often to re-poll a match, by its own state. Live → 12s (≈ the server's ESPN cache). Final → 0 (settled,
// never polls again). Scheduled → only near kickoff (≤90 min out) at 60s to catch the start, else 0. Returning
// 0 stops the background load entirely, so an open tab on a far-future or finished match isn't a silent poller.
function matchRefreshMs(m?: MatchInfo): number {
  if (!m) return 0;
  if (m.status === "live") return 12_000;
  if (m.status === "final") return 0;
  const ms = Date.parse(m.utc) - Date.now(); // client-only (SWR timer callback), so not a hydration concern
  // Poll from 90 min before kickoff to 30 min after, so a scheduled match auto-flips to live around kickoff
  // (the most-trafficked moment) without a manual refresh; otherwise don't poll a far-future/idle match.
  return ms < 90 * 60_000 && ms > -30 * 60_000 ? 60_000 : 0;
}

// ── shared poll ──────────────────────────────────────────────────────────────────────────────────────
// Every island on the page subscribes to the SAME key, so SWR dedupes to a single in-flight request and they
// update together. Cadence is gated by matchRefreshMs so settled/far-future matches don't poll forever.
function useMatchLive(matchNo: number, initial: MatchLivePayload): MatchLivePayload {
  return useLivePoll<MatchLivePayload>(
    `/api/match/${matchNo}`,
    initial,
    (d) => d?.m.status === "live",
    { interval: (d) => matchRefreshMs(d?.m) },
  );
}

function stateOf(m: MatchInfo): State {
  return m.status === "final" ? "final" : m.status === "live" ? "live" : m.defined ? "defined" : "undefined";
}

// Localized team name from a code (null/undefined → undefined, so callers can fall back to a slot label).
function nm(t: TFunction, code: string | null | undefined): string | undefined {
  return code ? t(`teams.${code}`) : undefined;
}

function roundName(t: TFunction, round: string): string {
  return t(`rounds.${round === "3P" ? "THIRD" : round}`);
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

function shareTextFor(t: TFunction, m: MatchInfo, state: State, homeName?: string, awayName?: string): string {
  if (state === "final") {
    const base = t("match.shareFinal", { home: homeName, homeScore: m.homeScore, awayScore: m.awayScore, away: awayName, round: roundName(t, m.round) });
    const ps = pensScore(m);
    return decidedOnPens(m) && ps ? `${base} (${t("common.penScore", { home: ps.home, away: ps.away })})` : base;
  }
  if (m.favorite && m.home && m.away)
    return t("match.shareFavorite", { favorite: nm(t, m.favorite.code) ?? m.favorite.name, pct: Math.round(m.favorite.winProb * 100), home: homeName, away: awayName });
  return t("match.shareUpcoming", {
    home: homeName ?? prettySlot(t, m.slotHome),
    away: awayName ?? prettySlot(t, m.slotAway),
  });
}

// A two-way "to advance" bar for knockout matches (someone always goes through — no draw endpoint). Home in
// pitch-green, away in cool-blue; percentages below, mirroring WinProbBar so the two read consistently.
function AdvanceBar({ home, away, homeName, awayName, t, secondary }: { home: number; away: number; homeName: string; awayName: string; t: TFunction; secondary?: boolean }) {
  // Compact variant (the pre-match row stacked under the live one): thinner, dimmer, single-line labels —
  // mirrors WinProbBar's `secondary` so the knockout layout matches the group-stage Now/Pre-match stack.
  if (secondary) {
    return (
      <div>
        <div className="bg-muted/40 flex h-1.5 w-full overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
          <div className="bg-primary/55" style={{ width: `${home * 100}%` }} />
          <div className="bg-data-cool/55" style={{ width: `${away * 100}%` }} />
        </div>
        <div className="text-muted-2 mt-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="min-w-0 truncate"><span className="font-mono tabular-nums">{forecastPct(home)}</span> {homeName}</span>
          <span className="min-w-0 truncate text-right">{awayName} <span className="font-mono tabular-nums">{forecastPct(away)}</span></span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="bg-muted/40 flex h-2.5 w-full overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
        <div className="bg-primary transition-[width] duration-700 ease-out" style={{ width: `${home * 100}%` }} />
        <div className="bg-data-cool transition-[width] duration-700 ease-out" style={{ width: `${away * 100}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="bg-primary size-2 shrink-0 rounded-full" aria-hidden />
            <span className="text-muted-foreground truncate text-xs">{homeName}</span>
          </div>
          <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">{forecastPct(home)}<span className="sr-only"> {t("awards.toWin")}</span></div>
        </div>
        <div className="min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-muted-foreground truncate text-xs">{awayName}</span>
            <span className="bg-data-cool size-2 shrink-0 rounded-full" aria-hidden />
          </div>
          <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">{forecastPct(away)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────────────────────────────
// The matchup IS the header. Score/clock/winner-tint and the whole state layout re-render from the poll, so
// kickoff (defined→live) and full-time (live→final) flip in place — no router.refresh.
export function MatchHero({ matchNo, initial, iterations, homeRank, awayRank, homeFifa, awayFifa }: { matchNo: number; initial: MatchLivePayload; iterations: number; homeRank?: number; awayRank?: number; homeFifa?: number; awayFifa?: number }) {
  const t = useT();
  const locale = useLocale();
  const { m } = useMatchLive(matchNo, initial);
  const state = stateOf(m);
  const homeName = nm(t, m.home);
  const awayName = nm(t, m.away);
  // Knockout settled on penalties: the regulation/ET score stays the headline, the shootout tally an
  // annotation. `ps` is null until ESPN's tally lands (then only the "pens" tag shows).
  const onPens = decidedOnPens(m);
  const ps = pensScore(m);
  const penLabel = ps ? t("common.penScore", { home: ps.home, away: ps.away }) : t("common.pens");
  // Rank chip under each team: defaults to our Elo rank; tap toggles to the FIFA ranking. Shared across both
  // sides so a tap flips them together (compare in the same system).
  const [rankMode, setRankMode] = useState<"elo" | "fifa">("elo");
  const toggleRank = () => setRankMode((r) => (r === "elo" ? "fifa" : "elo"));
  return (
    <section className="hero-sheen card-surface border-border-strong relative mt-5 overflow-hidden rounded-3xl border bg-surface-raised px-5 py-7 sm:px-10 sm:py-9 dark:inset-ring dark:inset-ring-white/8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="text-primary font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">
          {m.group ? t("match.heroEyebrowGroup", { round: roundName(t, m.round), group: m.group }) : roundName(t, m.round)}{" "}
          <span className="text-muted-2">{t("match.heroMatchNo", { match: m.match })}</span>
        </span>
        <ShareBar text={shareTextFor(t, m, state, homeName, awayName)} path={`/match/${m.match}`} compact />
      </div>
      {state === "undefined" ? (
        <div className="flex items-start justify-center gap-3 sm:gap-12">
          <HeroSlot m={m} side="home" t={t} locale={locale} />
          <span className="text-muted-2 flex size-11 shrink-0 items-center justify-center self-center rounded-full bg-background/40 font-mono text-[11px] font-semibold tracking-[0.12em] uppercase ring-1 ring-white/5 ring-inset dark:bg-black/15" aria-hidden>{t("common.vs")}</span>
          <HeroSlot m={m} side="away" t={t} locale={locale} />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3 sm:gap-12">
          <ScoreTeam m={m} side="home" locale={locale} t={t} eloRank={homeRank} fifaRank={homeFifa} rankMode={rankMode} onToggleRank={toggleRank} />
          <div className="flex shrink-0 flex-col items-center gap-2.5 rounded-xl bg-background/40 px-4 py-3 ring-1 ring-white/5 ring-inset dark:bg-black/15">
            {state === "final" || state === "live" ? (
              <span className="font-mono text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-6xl">
                {m.homeScore}<span className="text-muted-2 mx-2 align-middle text-[0.7em] font-normal">–</span>{m.awayScore}
              </span>
            ) : (
              <span className="text-muted-2 font-mono text-xs font-semibold tracking-[0.15em] uppercase">{t("common.vs")}</span>
            )}
            {state === "final" ? (
              <span className="flex flex-col items-center gap-1">
                <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{t("match.fullTime")}</span>
                {onPens && (
                  <span className="text-win font-mono text-[11px] font-semibold tracking-[0.06em] uppercase" title={t("common.wonOnPenalties")}>{penLabel}</span>
                )}
              </span>
            ) : state === "live" ? (
              <span className="text-live inline-flex items-center gap-1.5 text-xs font-semibold">
                <span className="bg-live size-1.5 animate-pulse rounded-full" />{m.liveDetail}
              </span>
            ) : (
              <span className="text-muted-2 font-mono text-[11px] font-semibold tracking-[0.1em] uppercase" suppressHydrationWarning><LocalTime utc={m.utc} mode="day" /></span>
            )}
          </div>
          <ScoreTeam m={m} side="away" locale={locale} t={t} eloRank={awayRank} fifaRank={awayFifa} rankMode={rankMode} onToggleRank={toggleRank} />
        </div>
      )}
      {state === "defined" && (m.advance || m.probs) && (
        <div className="mx-auto mt-7 max-w-xl rounded-xl bg-background/30 px-5 py-4 ring-1 ring-white/5 ring-inset dark:bg-black/10">
          {m.advance ? (
            // Knockout: lead with who ADVANCES (no draw endpoint); regulation W/D/L is the secondary read.
            <>
              <div className="text-muted-2 mb-2 text-center font-mono text-[10px] font-semibold tracking-wide uppercase">{t("match.toAdvance")}</div>
              <AdvanceBar home={m.advance.home} away={m.advance.away} homeName={homeName!} awayName={awayName!} t={t} />
              {m.probs && (
                <p className="text-muted-2 mt-3 text-center text-xs text-pretty">
                  {t("match.inNinety", { home: homeName, homePct: forecastPct(m.probs.home), drawPct: forecastPct(m.probs.draw), away: awayName, awayPct: forecastPct(m.probs.away) })}
                  {m.probs.draw > 0 && <> · {t("match.shootoutNote", { pct: forecastPct(m.probs.draw) })}</>}
                </p>
              )}
            </>
          ) : (
            <WinProbBar home={m.probs!.home} draw={m.probs!.draw} away={m.probs!.away} homeName={homeName!} awayName={awayName!} />
          )}
        </div>
      )}
      {state === "undefined" && (
        <p className="text-muted-2 mx-auto mt-7 max-w-xl rounded-xl bg-background/30 px-5 py-4 text-center text-xs text-pretty ring-1 ring-white/5 ring-inset dark:bg-black/10">
          {t("match.undefinedSlots", { iterations })}
        </p>
      )}
      {(state === "defined" || state === "undefined") && (
        <div className="mt-6 flex justify-center">
          <Countdown utc={m.utc} label={t("match.toKickoff")} />
        </div>
      )}
    </section>
  );
}

// ── Facts strip ──────────────────────────────────────────────────────────────────────────────────────
// Kickoff / venue / stage are static; the Status cell and the tickets CTA follow the live status from the
// poll, so a page opened before kickoff flips to "Live now" (and drops the buy-tickets CTA) on its own.
export function MatchFacts({ matchNo, initial, heat }: { matchNo: number; initial: MatchLivePayload; heat?: WatchPick }) {
  const t = useT();
  const locale = useLocale();
  const { m } = useMatchLive(matchNo, initial);
  const state = stateOf(m);
  return (
    <div className="border-border bg-card/60 mt-3 rounded-2xl border p-4 backdrop-blur-sm sm:p-5 dark:bg-card/50">
      <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
        <Fact label={t("match.factKickoff")} value={<LocalTime utc={m.utc} mode="datetime" />} />
        <Fact label={t("match.factVenue")} value={(() => {
          const slug = VENUE_BY_KEY[m.venue]?.slug;
          const venue = fifaVenue(m.venue);
          return slug ? (
            <><Link href={localeHref(locale, `/venues/${slug}`)} className="hover:text-primary underline-offset-2 hover:underline">{venue}</Link><span className="text-muted-2">, {m.city}</span></>
          ) : t("match.venueCity", { venue, city: m.city });
        })()} />
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
  );
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

// ── Body ─────────────────────────────────────────────────────────────────────────────────────────────
// The state-dependent tail: defined → prose + likely scorelines; live → live win-prob then goals/cards/stats
// then the provisional table; final → goals/cards/stats then the model's retrospective read. All from the poll.
export function MatchBody({ matchNo, initial, proseText, playerImages }: { matchNo: number; initial: MatchLivePayload; proseText: string | null; playerImages?: Record<string, string> }) {
  const t = useT();
  const { m, summary, liveProbs, proj } = useMatchLive(matchNo, initial);
  const state = stateOf(m);
  const homeName = nm(t, m.home);
  const awayName = nm(t, m.away);
  // Knockout settled on penalties — annotate the full-time result (see also MatchHero).
  const onPens = decidedOnPens(m);
  const ps = pensScore(m);
  const penLabel = ps ? t("common.penScore", { home: ps.home, away: ps.away }) : t("common.pens");

  const matchFacts = m.home && m.away && (
    <>
      <MatchTimeline events={summary.events} homeCode={m.home} awayCode={m.away} homeName={homeName!} awayName={awayName!} final={m.status === "final"} scored={(m.homeScore ?? 0) + (m.awayScore ?? 0) > 0} playerImages={playerImages} />
      <MatchStats stats={summary.stats} />
    </>
  );

  return (
    <>
      {state === "defined" && m.probs && proseText && (
        <p className="text-muted-foreground mt-8 max-w-3xl text-sm text-pretty">{proseText}</p>
      )}

      {/* Completed match: the goals/cards + stats lead, then the shootout (if any), then the model's read. */}
      {state === "final" && matchFacts}
      {state === "final" && onPens && summary.shootout && (
        <PenaltyShootout
          homeCode={m.home}
          awayCode={m.away}
          homeName={homeName!}
          awayName={awayName!}
          home={summary.shootout.home}
          away={summary.shootout.away}
          homePens={m.homePens}
          awayPens={m.awayPens}
          winner={m.winner}
        />
      )}
      {state === "final" && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.preMatchRead")}</h2>
          <div className="border-border bg-card card-surface rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/8">
            {m.probs ? (
              <>
                <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={homeName!} awayName={awayName!} />
                <p className="text-muted-2 mt-4 text-xs">
                  {m.xg && <>{t("match.expectedGoalsPrefix", { home: m.xg.home.toFixed(1), away: m.xg.away.toFixed(1) })} </>}
                  {t("match.actualResult")} <span className="text-foreground/80 font-medium">{m.homeScore}–{m.awayScore}{onPens ? ` (${penLabel})` : ""}</span>.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("match.fullTimeLabel")} <span className="text-foreground font-medium">{homeName} {m.homeScore}–{m.awayScore} {awayName}{onPens ? ` (${penLabel})` : ""}</span>.
              </p>
            )}
          </div>
        </section>
      )}

      {state === "live" && m.probs && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">
            {liveProbs ? t("match.liveWinProb") : t("match.preMatchWinProb")}
          </h2>
          <div className="border-border bg-card card-surface rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/8">
            <p className="text-live mb-3 text-xs font-medium">
              {t("match.liveScoreLine", { home: homeName, homeScore: m.homeScore, awayScore: m.awayScore, away: awayName, detail: m.liveDetail })}
            </p>
            {liveProbs && liveProbs.advance && m.round !== "GROUP" ? (
              // Knockout, live: lead with who ADVANCES right now (incl. ET + shootout); the regulation "now"
              // and the pre-match advance follow as comparison.
              <>
                <div className="text-live mb-2 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("match.toAdvanceNow")}</div>
                <AdvanceBar home={liveProbs.advance.home} away={liveProbs.advance.away} homeName={homeName!} awayName={awayName!} t={t} />
                {m.advance && (
                  <div className="border-border/50 mt-4 border-t pt-3">
                    <div className="text-muted-2 mb-1.5 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("match.preMatchLabel")}</div>
                    <AdvanceBar home={m.advance.home} away={m.advance.away} homeName={homeName!} awayName={awayName!} t={t} secondary />
                  </div>
                )}
                <p className="text-muted-2 mt-3 text-xs text-pretty">
                  {t("match.inNinety", { home: homeName, homePct: forecastPct(liveProbs.home), drawPct: forecastPct(liveProbs.draw), away: awayName, awayPct: forecastPct(liveProbs.away) })}
                </p>
              </>
            ) : liveProbs ? (
              <>
                {/* Group, live: Now and Pre-match share the same bar + 3-column layout so the percentages line
                    up vertically — the move reads at a glance without the eye hunting between formats. */}
                <div className="text-live mb-2 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("match.now")}</div>
                <WinProbBar home={liveProbs.home} draw={liveProbs.draw} away={liveProbs.away} homeName={homeName!} awayName={awayName!} />
                <div className="border-border/50 mt-4 border-t pt-3">
                  <div className="text-muted-2 mb-1.5 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("match.preMatchLabel")}</div>
                  <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={homeName!} awayName={awayName!} secondary />
                </div>
              </>
            ) : m.advance && m.round !== "GROUP" ? (
              // Live but no clock yet (kickoff imminent) — show the pre-match advance for a knockout.
              <AdvanceBar home={m.advance.home} away={m.advance.away} homeName={homeName!} awayName={awayName!} t={t} />
            ) : (
              <WinProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeName={homeName!} awayName={awayName!} />
            )}
            <p className="text-muted-2 mt-4 text-xs">{t("match.forecastUpdatesNote")}</p>
          </div>
        </section>
      )}

      {/* Live match: the dynamic win-probability led; now the goals/cards + stats detail follows. */}
      {state === "live" && matchFacts}

      {/* Live group match: "if the live score holds" provisional standings. */}
      {state === "live" && proj && (
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
          <div className="border-border bg-card card-surface divide-border/50 divide-y rounded-2xl border dark:inset-ring dark:inset-ring-white/8">
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
    </>
  );
}

// ── hero sides (ported from the server page; localized from codes via useT) ────────────────────────────
function ScoreTeam({ m, side, locale, t, eloRank, fifaRank, rankMode, onToggleRank }: { m: MatchInfo; side: "home" | "away"; locale: Locale; t: TFunction; eloRank?: number; fifaRank?: number; rankMode: "elo" | "fifa"; onToggleRank: () => void }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = nm(t, resolved);
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
  // The chip shows the selected ranking (defaults to Elo); falls back to whichever exists.
  const useFifa = rankMode === "fifa" && fifaRank != null;
  const chip = useFifa ? t("match.fifaRank", { rank: fifaRank }) : eloRank != null ? t("match.eloRank", { rank: eloRank }) : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <Link
        href={localeHref(locale, `/team/${slugForCode(resolved)}`)}
        className="group/team focus-visible:ring-primary/50 focus-visible:ring-offset-surface-raised flex min-w-0 flex-col items-center gap-3 rounded-xl text-center transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span className={lose ? "opacity-60 saturate-[0.85]" : ""}><Flag code={resolved} size={64} /></span>
        <div className={`decoration-primary/40 group-hover/team:text-primary font-display text-xl leading-tight font-semibold tracking-[-0.02em] text-balance underline-offset-4 group-hover/team:underline sm:text-2xl ${win ? "text-win" : lose ? "text-muted-foreground" : ""}`}>{name}</div>
      </Link>
      {chip && (eloRank != null || fifaRank != null) && (
        <button
          type="button"
          onClick={onToggleRank}
          title={t("match.rankToggleHint")}
          className="text-muted-2 hover:text-foreground decoration-muted-foreground/40 -m-1 cursor-pointer p-1 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase underline decoration-dotted underline-offset-2 transition-colors"
        >
          {chip}
        </button>
      )}
    </div>
  );
}

function HeroSlot({ m, side, t, locale }: { m: MatchInfo; side: "home" | "away"; t: TFunction; locale: Locale }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = nm(t, resolved);
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
  const rest = cands.slice(1).filter((c) => c.prob >= 0.02).slice(0, 3);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2.5 text-center">
      <div className="text-muted-2 max-w-full truncate font-mono text-[11px] font-semibold tracking-[0.1em] uppercase">{prettySlot(t, slot)}</div>
      <Link href={localeHref(locale, `/team/${slugForCode(top.code)}`)} className="group/team flex flex-col items-center gap-3 transition-colors">
        <Flag code={top.code} size={64} />
        <div className="decoration-primary/40 group-hover/team:text-primary font-display text-xl leading-tight font-semibold tracking-[-0.02em] text-balance underline-offset-4 group-hover/team:underline sm:text-2xl">{nm(t, top.code) ?? top.name}</div>
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
              <span className="min-w-0 flex-1 truncate text-left">{nm(t, r.code) ?? r.name}</span>
              <span className="shrink-0 font-mono tabular-nums">{forecastPct(r.prob)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
