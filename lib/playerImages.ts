// Player headshots from TheSportsDB (community sports database, free API). ESPN's feed only carries headshots
// for ~20% of squads; TheSportsDB has transparent-PNG "cutouts" for nearly everyone. We resolve by name and
// disambiguate by nationality (its `strNationality` matches our team names exactly, even for tricky cases like
// "Czechia"/"Ivory Coast"), so a common name can't match the wrong person. Best-effort + heavily cached:
// fetched lazily per player view, never in bulk, so it can't hammer the API; any miss falls back to a monogram.
import { cache } from "react";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, PLAYER_IMG_KEY } from "./kv";
import { TEAM_BY_CODE } from "./data/teams";
import { playerSlug } from "./players";

const API = "https://www.thesportsdb.com/api/v1/json";
const KEY = process.env.THESPORTSDB_KEY || "3"; // "3" is the free public test key — set a real key in prod

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface TSDBPlayer {
  strPlayer?: string;
  strNationality?: string;
  strCutout?: string; // transparent-PNG head/shoulders — preferred
  strThumb?: string; // fallback
}

// Returns a URL, `null` for a genuine no-match (safe to cache), or `undefined` for a TRANSIENT failure —
// rate-limiting (429), a 5xx, or a network/parse error. Transient results must NOT be cached, or a temporary
// rate-limit would poison the cache with a false "no photo" for days. The free key (`"3"`) rate-limits under
// bursty load, so this matters; a real THESPORTSDB_KEY largely avoids it.
async function fetchPlayerImage(name: string, teamCode: string): Promise<string | null | undefined> {
  const country = TEAM_BY_CODE[teamCode]?.name;
  if (!country) return null;
  let r: Response;
  try {
    r = await fetch(`${API}/${KEY}/searchplayers.php?p=${encodeURIComponent(name)}`, { cache: "no-store" });
  } catch {
    return undefined; // network error — retry next time
  }
  if (r.status === 429 || r.status >= 500) return undefined; // rate-limited / server error — don't cache
  if (!r.ok) return null;
  let d: { player?: TSDBPlayer[] };
  try {
    d = (await r.json()) as { player?: TSDBPlayer[] };
  } catch {
    return undefined; // bad/empty body (often a throttle) — don't cache
  }
  const cn = norm(country);
  // Only accept a candidate whose nationality matches this player's World Cup nation, preferring a cutout.
  const sameNation = (d.player ?? []).filter((p) => p.strNationality && norm(p.strNationality) === cn);
  const pick = sameNation.find((p) => p.strCutout) ?? sameNation.find((p) => p.strThumb) ?? null;
  return pick?.strCutout || pick?.strThumb || null;
}

// KV-cached (hits for 14 days, genuine misses re-checked after 2) and React-cached per request. Transient
// failures (undefined) are never written, so the avatar simply retries on the next render until it resolves.
export const getPlayerImage = cache(async (name: string, teamCode: string): Promise<string | null> => {
  const key = `${PLAYER_IMG_KEY}:${playerSlug(name, teamCode)}`;
  if (KV_CONFIGURED) {
    try {
      const c = await kvGetJSON<{ at: number; url: string | null }>(key);
      if (c && Date.now() - c.at < (c.url ? 14 : 2) * 24 * 60 * 60_000) return c.url;
    } catch {
      /* fall through to a fresh fetch */
    }
  }
  const res = await fetchPlayerImage(name, teamCode);
  if (res !== undefined && KV_CONFIGURED) await kvSetJSON(key, { at: Date.now(), url: res }).catch(() => {});
  return res ?? null;
});
