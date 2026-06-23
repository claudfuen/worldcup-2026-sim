import { cache } from "react";
import { fetchLive } from "./espn";
import type { MatchInfo } from "./predictions";

// Fresh in-progress AND just-finished matches, fetched per request (cache() dedupes within a single
// render) and resilient to ESPN hiccups. This is the real-time layer that surfaces scores between
// prediction-cron runs; it never moves the model (standings/ratings/odds) - the cron owns that.
export const getLiveMatches = cache(async () => {
  try {
    return await fetchLive();
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
    return { ...m, status: "live" as const, homeScore, awayScore, liveDetail: l.detail };
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
