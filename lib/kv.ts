// Minimal Upstash Redis REST client (Vercel KV). Uses the REST command endpoint.
const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function cmd(args: (string | number)[]): Promise<unknown> {
  if (!URL || !TOKEN) throw new Error("KV env not configured (KV_REST_API_URL / KV_REST_API_TOKEN)");
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`KV ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { result?: unknown };
  return j.result;
}

export async function kvSetJSON(key: string, value: unknown): Promise<void> {
  await cmd(["SET", key, JSON.stringify(value)]);
}

export async function kvGetJSON<T>(key: string): Promise<T | null> {
  const r = await cmd(["GET", key]);
  if (r == null) return null;
  return JSON.parse(r as string) as T;
}

export const KV_CONFIGURED = Boolean(URL && TOKEN);

// Bump when the payload shape changes so stale cached data is ignored.
// v4: removed per-user `myMatches` from the shared payload (now stored per-user in Postgres).
// v5: clinch now resolves fully-decided groups via settled GD/GF — drop payloads cached with the old
//     (over-conservative) clinch so completed groups show definitive states immediately, not on next cron.
// v6: thirdPlaceRace entries gained advanceProb + status (the calibrated R32 chance, replacing the
//     misleading binary In/Out snapshot).
// v7: teams gained ratingExact (full-precision Elo) so render-time live finalization reproduces the cron
//     standings/third-place tiebreaks exactly; live standings now reflect in-progress goal difference.
// v8: thirdPlaceRace entries gained slotLocked/opponent/city + top-3 likely opponents for the hover detail.
// v9: thirdPlaceRace entries gained `decided` (group fully played) so the hover can compute the survival math.
// v10: Monte Carlo now conditions on actual knockout results; matches gained `winner` + resolved KO
//      participants/scores (played W##/L## feeders propagate; penalty winners come from ESPN's flag).
// v11: Monte Carlo now also conditions on LIVE (in-progress) group matches — every probability re-routes
//      off the live scoreline; matches gained `liveMinute`.
// v12: bracket now resolves a third-place R32 slot to its exact team as soon as it's mathematically locked
//      (per-slot Annex C invariance, excluding eliminated groups) — not only once the whole group stage ends.
export const PRED_KEY = "predictions:v12";

// Start-of-day snapshot of title/advance odds, for "moved since yesterday" deltas. Rolled once per ET day.
export const BASELINE_KEY = "predictions:baseline:v1";

// Signature of the live/just-finished match state from the previous cron tick (with a timestamp). Lets the
// frequent cron skip the heavy Monte Carlo when nothing has changed, and recompute the instant a live score,
// clock minute, or full-time result moves. Versioned with PRED_KEY so a deploy forces a fresh recompute.
export const LIVE_SIG_KEY = "predictions:livesig:v11";

// Short-lived cache of the raw ESPN live scoreboard, shared across requests so a traffic spike during a
// match can't hammer ESPN (bounded to a few calls per minute regardless of concurrent visitors).
export const LIVE_FEED_KEY = "live:scoreboard:v1";

// Per-match timeline + stats from ESPN's summary endpoint (suffixed with the match number). Short TTL for
// live matches, hours for finished ones — set by the caller; this is just the key prefix.
// v2: timeline gained substitutions.
export const MATCH_EVENTS_KEY = "match:summary:v2";
