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
// v13: payload gained `awards` — Golden Boot + assists race (live tallies aggregated from match timelines,
//      plus a forecast of the final finish: projected tally + P(win) via a seeded Monte Carlo).
// v14: award entries gained `matchesLeft` (expected remaining matches a player's team plays) — the forecast's
//      upside lever, surfaced in the UI.
// v15: award entries gained `eliminated` — a definitive "out" for a player whose team has no matches left and
//      is already below the leader (shown as "out", not a 0% probability).
// v16: award entries gained `clinched` (won — only once the tournament is over); AND a fix so a knockout match
//      whose participant resolves from a locked third-place slot (e.g. Mexico v Ecuador) now gets its pre-match
//      W/D/L / xG / scorelines (previously null because the slot resolved after the forecast pass).
// v17: knockout matches gained `advance` ({home,away}) — P(each side progresses incl. extra time + shootout),
//      so the KO match page leads with "to advance" instead of a regulation draw.
// v18: payload gained `complete` (all matches played) + `champion` (final's winner) — the tournament-over
//      signal the UI keys off for champion-crown / archive states.
// v19: knockout matches gained `homePens`/`awayPens` — the penalty shootout tally (from ESPN's shootoutScore)
//      for a tie settled on penalties, so the result shows "1–1 (4–3 pens)" instead of a bare draw everywhere.
// v20: awards gained `players` — the full-squad universe (lineups ∪ scorers, incl. goalkeepers) that backs
//      player pages, search and the sitemap, each with position + appearances + tallies.
// v21: fix position classification (by descriptive name; substitutes/unknown no longer mislabeled "FW").
// v22: "Sweeper" now classifies as DF (was unset); player universe widened to everyone named in a timeline
//      (scorers, assisters, carded, subbed) so every timeline name links to a real page.
// v23: player positions now come from the canonical squad roster (ESPN teams/{id}/roster), so benched players
//      (who have no matchday position — the Ochoa/St-Clair case) get their real position. Forces a refresh.
export const PRED_KEY = "predictions:v23";

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
// v3: summary gained `shootout` (penalty-shootout takers) — bump so finished-match caches (6h TTL) refetch.
// v4: summary gained `lineups` (matchday squads incl. goalkeepers) for full-squad player coverage.
// v5: positions classified by descriptive name (subs/unknown no longer mislabeled "FW"); lineups gained
//     subbedIn/subbedOut for per-match player logs (started / came on / unused, minutes, cards).
// v6: "Sweeper" now classifies as DF (was unset) — bump so cached summaries refetch with the fix.
export const MATCH_EVENTS_KEY = "match:summary:v6";

// Canonical squad positions (name|code -> GK/DF/MF/FW) from ESPN's per-team roster — fills positions for
// players who only ever appear as substitutes (a benched player has no resolvable matchday position).
// v1: initial. Long TTL inside the loader; versioned so a shape change forces a refresh.
export const SQUAD_POS_KEY = "squad:positions:v1";

// Per-player headshot URL (or null) resolved from TheSportsDB, keyed by player slug. Long TTL — photos are
// stable; misses re-check sooner (a player's photo may get added). Suffixed with the slug by the caller.
export const PLAYER_IMG_KEY = "player:img:v1";
