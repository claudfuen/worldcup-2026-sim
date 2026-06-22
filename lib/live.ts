import { cache } from "react";
import { fetchLive } from "./espn";
import type { MatchInfo } from "./predictions";

// Fresh in-progress matches, fetched per request (cache() dedupes within a single render) and resilient
// to ESPN hiccups. Kept separate from the 30-min prediction cron so live scores update in real time.
export const getLiveMatches = cache(async () => {
  try {
    return await fetchLive();
  } catch {
    return [];
  }
});

// Overlay live scores onto the (cron-cached) prediction matches: mark in-progress matches "live" with
// their current score and clock, oriented to each match's home/away. Completed matches are left as-is.
export function overlayLive(matches: MatchInfo[], live: Awaited<ReturnType<typeof getLiveMatches>>): MatchInfo[] {
  if (!live.length) return matches;
  const byPair = new Map(live.map((l) => [[l.homeCode, l.awayCode].sort().join("-"), l]));
  return matches.map((m) => {
    if (m.status === "final" || !m.home || !m.away) return m;
    const l = byPair.get([m.home, m.away].sort().join("-"));
    if (!l) return m;
    const orient = l.homeCode === m.home;
    return {
      ...m,
      status: "live" as const,
      homeScore: orient ? l.homeGoals : l.awayGoals,
      awayScore: orient ? l.awayGoals : l.homeGoals,
      liveDetail: l.detail,
    };
  });
}
