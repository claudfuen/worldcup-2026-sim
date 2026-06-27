import { cache } from "react";
import { fetchLive, type LiveMatch } from "./espn";
import { liveWdl, liveKoAdvance, fracRemaining } from "./sim/poisson";
import { hostEloBoost } from "./sim/hosts";
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
// toward the actual result as the clock runs. Returns null when the match isn't live or the minute is unknown
// (we don't guess a clock). Cheap + analytic, so it can run on every render at no extra ESPN cost.
export function liveMatchProbs(m: MatchInfo, ratings: Ratings): LiveProbs | null {
  if (m.status !== "live" || !m.home || !m.away || m.homeScore == null || m.awayScore == null) return null;
  if (m.liveMinute == null) return null;
  const diff =
    (ratings[m.home] ?? 1500) - (ratings[m.away] ?? 1500) +
    hostEloBoost(m.home, m.venue) - hostEloBoost(m.away, m.venue);
  const frac = fracRemaining(m.liveMinute);
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
