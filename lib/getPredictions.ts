import { cache } from "react";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, PRED_KEY } from "./kv";
import { computePredictions, type PredictionsPayload } from "./predictions";
import { getLiveMatches } from "./live";

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
