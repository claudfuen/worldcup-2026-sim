import { cache } from "react";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, PRED_KEY } from "./kv";
import { computePredictions, type PredictionsPayload } from "./predictions";

// Shared loader for all pages: read the cached payload from KV; cold-start computes once and seeds it.
// Wrapped in React cache() so the layout (navbar freshness) and the page share one read per request.
export const getPredictions = cache(async (): Promise<PredictionsPayload> => {
  if (KV_CONFIGURED) {
    const cached = await kvGetJSON<PredictionsPayload>(PRED_KEY);
    if (cached) return cached;
  }
  const fresh = await computePredictions(20000);
  if (KV_CONFIGURED) await kvSetJSON(PRED_KEY, fresh).catch(() => {});
  return fresh;
});
