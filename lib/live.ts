import { cache } from "react";
import { fetchLive, type LiveMatch } from "./espn";
import { liveWdl, liveKoAdvance, fracRemaining, liveEloAdjustment } from "./sim/poisson";
import { hostEloBoost } from "./sim/hosts";
import { redCardCount, fetchEventSummary, type MatchSummary } from "./matchEvents";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, LIVE_FEED_KEY } from "./kv";
import type { Ratings } from "./sim/types";
import type { MatchInfo } from "./predictions";

// How long a fetched ESPN scoreboard is reused across requests. Short enough that scores stay near-live,
// long enough that a busy match (many concurrent visitors) hits ESPN only a few times a minute, not once
// per render — the rate-limit guard. cache() still dedupes within a single render on top of this.
const LIVE_FEED_TTL_MS = 12_000;

// Fresh in-progress AND just-finished matches. Backed by a short shared KV cache (so high traffic during a
// match can't hammer ESPN) and resilient to ESPN hiccups. This is the real-time layer that surfaces scores
// between prediction-cron runs; it never moves the model (standings/ratings/odds) — the cron owns that.
export const getLiveMatches = cache(async (): Promise<LiveMatch[]> => {
  if (KV_CONFIGURED) {
    try {
      const cached = await kvGetJSON<{ at: number; items: LiveMatch[] }>(LIVE_FEED_KEY);
      if (cached && Date.now() - cached.at < LIVE_FEED_TTL_MS) return cached.items;
    } catch {
      /* fall through to a direct fetch */
    }
  }
  try {
    const items = await fetchLive();
    if (KV_CONFIGURED) await kvSetJSON(LIVE_FEED_KEY, { at: Date.now(), items }).catch(() => {});
    return items;
  } catch {
    return [];
  }
});

// Overlay live / just-finished scores onto the (cron-cached) prediction matches. An in-progress match is
// marked "live" with its current score; a match ESPN reports at full-time that the model hasn't absorbed
// yet is marked "final" with its final score - so a finished match shows its result instantly instead of
// reverting to "scheduled" until the next cron tick. Matches already final in KV are left as-is (the cron
// holds the authoritative result, including the standings/odds it moved).
export function overlayLive(matches: MatchInfo[], live: Awaited<ReturnType<typeof getLiveMatches>>): MatchInfo[] {
  if (!live.length) return matches;
  const byPair = new Map(live.map((l) => [[l.homeCode, l.awayCode].sort().join("-"), l]));
  return matches.map((m) => {
    if (m.status === "final" || !m.home || !m.away) return m; // KV already has the authoritative final
    const l = byPair.get([m.home, m.away].sort().join("-"));
    if (!l) return m;
    const orient = l.homeCode === m.home;
    const homeScore = orient ? l.homeGoals : l.awayGoals;
    const awayScore = orient ? l.awayGoals : l.homeGoals;
    if (l.state === "post") {
      return { ...m, status: "final" as const, homeScore, awayScore };
    }
    return { ...m, status: "live" as const, homeScore, awayScore, liveDetail: l.detail, liveMinute: l.minute ?? undefined };
  });
}

// Enrich in-progress matches with an in-game Elo nudge (red cards + shot/possession dominance) by pulling
// each one's ESPN summary. Home-perspective; consumers orient it to their own home/away. Best-effort: a
// summary that fails to load just leaves eloAdj unset (the match still conditions on score + time). Called
// by the cron only when it actually recomputes, so the extra ESPN calls are bounded to live matches.
export async function withLiveAdjustments(live: LiveMatch[]): Promise<LiveMatch[]> {
  const inPlay = live.filter((l) => l.state === "in" && l.minute != null && l.eventId);
  if (!inPlay.length) return live;
  const summaries = await Promise.all(inPlay.map((l) => fetchEventSummary(l.eventId, l.homeCode, l.awayCode).catch(() => null)));
  const adj = new Map<string, number>();
  inPlay.forEach((l, i) => {
    const s = summaries[i];
    if (!s) return;
    const reds = redCardCount(s.events, l.homeCode, l.awayCode);
    const a = liveEloAdjustment(
      {
        redHome: reds.home, redAway: reds.away,
        possHome: s.stats?.home.possession ?? undefined, possAway: s.stats?.away.possession ?? undefined,
        shotsHome: s.stats?.home.shots ?? undefined, shotsAway: s.stats?.away.shots ?? undefined,
        sotHome: s.stats?.home.shotsOnTarget ?? undefined, sotAway: s.stats?.away.shotsOnTarget ?? undefined,
      },
      fracRemaining(l.minute!),
    );
    if (a !== 0) adj.set(l.eventId, a);
  });
  if (!adj.size) return live;
  return live.map((l) => (adj.has(l.eventId) ? { ...l, eloAdj: adj.get(l.eventId) } : l));
}

// A compact fingerprint of the current live/just-finished match state. The frequent cron stores this and
// re-runs the Monte Carlo only when it changes — i.e. on a goal, a clock-minute tick, or a full-time whistle
// — so probabilities track the action without recomputing every minute when nothing is happening.
export function liveSignature(live: LiveMatch[]): string {
  return live
    .map((l) => `${[l.homeCode, l.awayCode].sort().join("-")}:${l.state}:${l.homeGoals}-${l.awayGoals}:${l.minute ?? "?"}`)
    .sort()
    .join("|");
}

export interface LiveProbs {
  minute: number;
  home: number; // P(home wins in regulation, given the live score + time left)
  draw: number;
  away: number;
  advance?: { home: number; away: number }; // knockout only: P(side advances incl. ET + shootout)
}

// CURRENT win/draw/loss for an in-progress match, conditioned on the live score and minute elapsed — the
// "now" read shown next to the pre-match forecast. Uses the same rating gap as the cron's pre-match probs
// (live Elo + host advantage), so the two reconcile: at kickoff this ~equals the pre-match line and sharpens
// toward the actual result as the clock runs. When the match summary is supplied, the gap is further bent by
// the in-game state — red cards (a big handicap) and shot/possession dominance. Returns null when the match
// isn't live or the minute is unknown (we don't guess a clock). Cheap + analytic.
export function liveMatchProbs(m: MatchInfo, ratings: Ratings, summary?: MatchSummary): LiveProbs | null {
  if (m.status !== "live" || !m.home || !m.away || m.homeScore == null || m.awayScore == null) return null;
  if (m.liveMinute == null) return null;
  const frac = fracRemaining(m.liveMinute);
  let diff =
    (ratings[m.home] ?? 1500) - (ratings[m.away] ?? 1500) +
    hostEloBoost(m.home, m.venue) - hostEloBoost(m.away, m.venue);
  if (summary) {
    const reds = redCardCount(summary.events, m.home, m.away);
    diff += liveEloAdjustment(
      {
        redHome: reds.home, redAway: reds.away,
        possHome: summary.stats?.home.possession ?? undefined, possAway: summary.stats?.away.possession ?? undefined,
        shotsHome: summary.stats?.home.shots ?? undefined, shotsAway: summary.stats?.away.shots ?? undefined,
        sotHome: summary.stats?.home.shotsOnTarget ?? undefined, sotAway: summary.stats?.away.shotsOnTarget ?? undefined,
      },
      frac,
    );
  }
  const wdl = liveWdl(diff, m.homeScore, m.awayScore, frac);
  const out: LiveProbs = { minute: m.liveMinute, home: wdl.win, draw: wdl.draw, away: wdl.loss };
  if (m.round !== "GROUP") {
    out.advance = {
      home: liveKoAdvance(diff, m.homeScore, m.awayScore, frac),
      away: liveKoAdvance(-diff, m.awayScore, m.homeScore, frac),
    };
  }
  return out;
}

// Attach the current (live-conditioned) W/D/L to every in-progress match, so client components that lack the
// ratings can still show a live win probability. A render-time enrichment (not stored in KV); a no-op for
// matches that aren't live or whose clock is unknown.
export function attachLiveProbs(matches: MatchInfo[], ratings: Ratings): MatchInfo[] {
  return matches.map((m) => {
    const lp = liveMatchProbs(m, ratings);
    return lp ? { ...m, liveProbs: { home: lp.home, draw: lp.draw, away: lp.away } } : m;
  });
}

// Safety bound: keep auto-refreshing for at most 6h after a match's kickoff while the model catches up,
// so an ESPN/ingestion edge case can never pin a tab into refreshing forever.
const RECENT_FINAL_WINDOW_MS = 6 * 60 * 60 * 1000;

// Should a page keep auto-refreshing? True when a match is in progress, or when a match has just finished
// (ESPN "post") but the prediction cron hasn't absorbed it into KV yet - so an open tab keeps refreshing
// through the dead zone until standings/odds catch up, then stops. Pass the ORIGINAL (pre-overlay) KV
// matches so the "already absorbed" check is accurate.
export function liveActivity(matches: MatchInfo[], live: Awaited<ReturnType<typeof getLiveMatches>>): boolean {
  if (live.some((l) => l.state === "in")) return true;
  const kvFinal = new Set(
    matches.filter((m) => m.status === "final" && m.home && m.away).map((m) => [m.home!, m.away!].sort().join("-")),
  );
  const now = Date.now();
  return live.some(
    (l) =>
      l.state === "post" &&
      !kvFinal.has([l.homeCode, l.awayCode].sort().join("-")) &&
      now - Date.parse(l.date) < RECENT_FINAL_WINDOW_MS,
  );
}
