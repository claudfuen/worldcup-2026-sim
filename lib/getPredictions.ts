import { cache } from "react";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, PRED_KEY } from "./kv";
import { computePredictions, type PredictionsPayload } from "./predictions";
import { getLiveMatches } from "./live";
import { liveAwards, type Awards } from "./awards";
import { getMatchSummary } from "./matchEvents";
import type { TeamProb } from "./sim/simulate";

// Shared loader for all pages: read the cached payload from KV; cold-start computes once and seeds it.
// Wrapped in React cache() so the layout (navbar freshness) and the page share one read per request.
// On a cache miss we fold in live matches too, so a cold start during a match is already live-conditioned
// (the cron is the normal owner of the cached payload; this is the warm-up fallback).
export const getPredictions = cache(async (): Promise<PredictionsPayload> => {
  if (KV_CONFIGURED) {
    const cached = await kvGetJSON<PredictionsPayload>(PRED_KEY);
    if (cached) return cached;
  }
  const live = await getLiveMatches();
  const fresh = await computePredictions(20000, undefined, live);
  if (KV_CONFIGURED) await kvSetJSON(PRED_KEY, fresh).catch(() => {});
  return fresh;
});

// Awards boards with live goals folded in at render time. The cached payload's `awards` is a final-settled
// baseline (the cron counts only completed matches); this overlays the in-progress matches' tallies on top so
// the Golden Boot / assists race track a live goal the moment it lands — the same render-time live overlay the
// score ticker uses for matches. Cheap (reads only the live matches' cached summaries, carries the baseline's
// win-prob forecast) and shared via cache() so a page's multiple award modules compute it once per request.
export const getLiveAwards = cache(async (): Promise<Awards> => {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const teams: Record<string, TeamProb> = {};
  for (const t of data.teams) teams[t.code] = t;
  return liveAwards(data.awards, data.matches, live, teams, getMatchSummary).catch(() => data.awards);
});
