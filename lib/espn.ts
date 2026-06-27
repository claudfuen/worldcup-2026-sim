// Live ingestion from ESPN's public FIFA World Cup feed (no key required).
import { TEAM_BY_ESPN, TEAMS } from "./data/teams";
import { updateElo, kWeight } from "./sim/elo";
import { roundRobin } from "./sim/simulate";
import { fracRemaining } from "./sim/poisson";
import { SCHEDULE } from "./data/schedule";
import type { GroupMatch, Ratings } from "./sim/types";

// venue per group fixture (by sorted team pair), from the canonical schedule
const VENUE_BY_PAIR = new Map<string, string>(
  SCHEDULE.filter((m) => m.round === "GROUP" && m.home && m.away).map((m) => [[m.home!, m.away!].sort().join("-"), m.venue]),
);

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
// Last calendar day (UTC) any GROUP match is played — DERIVED from the schedule so it can't go stale.
// Its job: separate group results from knockout REMATCHES of two same-group teams. `group` is set whenever
// both teams share a group (see below), so a same-group QF/SF would otherwise pollute group standings; the
// date cutoff drops it. Safe because the R32 has no same-group pairings (so 06-28's R32 games have
// group=null and are excluded anyway) and same-group matchups are first possible in the R16, which starts
// well after the last group day. Hardcoding "2026-06-27" previously dropped the real 06-28 Group J finals.
export const GROUP_STAGE_END = SCHEDULE.reduce(
  (mx, m) => (m.round === "GROUP" && m.utc.slice(0, 10) > mx ? m.utc.slice(0, 10) : mx),
  "2026-06-11",
);

export interface FetchedMatch {
  date: string;
  homeCode: string;
  awayCode: string;
  group: string | null; // same group => group-stage match
  homeGoals: number;
  awayGoals: number;
  winnerCode?: string | null; // the team ESPN marks as advancing — set for knockouts, incl. penalty wins (regulation score is a draw)
}

// Fetch all COMPLETED matches (full-time only) across the tournament window.
export async function fetchResults(): Promise<FetchedMatch[]> {
  const res = await fetch(`${SCOREBOARD}?dates=20260611-20260719`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  const out: FetchedMatch[] = [];
  for (const e of data.events ?? []) {
    const comp = e.competitions?.[0];
    if (!comp || comp.status?.type?.state !== "post") continue; // only finished matches
    const cs = comp.competitors ?? [];
    if (cs.length !== 2) continue;
    const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
    const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
    const ht = TEAM_BY_ESPN[home.team.displayName];
    const at = TEAM_BY_ESPN[away.team.displayName];
    if (!ht || !at) continue;
    out.push({
      date: e.date,
      homeCode: ht.code,
      awayCode: at.code,
      group: ht.group === at.group ? ht.group : null,
      homeGoals: Number(home.score),
      awayGoals: Number(away.score),
      winnerCode: home.winner ? ht.code : away.winner ? at.code : null,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export interface LiveMatch {
  homeCode: string;
  awayCode: string;
  group: string | null;
  homeGoals: number;
  awayGoals: number;
  state: "in" | "post"; // "in" = in-progress, "post" = full-time (just finished)
  date: string; // ESPN kickoff time (ISO) - lets callers bound "recently finished"
  detail: string; // e.g. "45'+3'", "HT", "FT" - the clock/state from ESPN
  minute: number | null; // parsed elapsed minute (HT=45, "63'"->63, "45'+2'"->47), for live conditioning
}

// Parse ESPN's soccer clock into an ELAPSED minute used for live win-probability conditioning. ESPN gives
// a minute string for in-progress soccer ("63'", "45'+2'", "HT") plus a period index; we read the string
// first (most precise) and fall back to a rough per-period midpoint. Returns null only when nothing is
// parseable (callers then treat the live match as frozen rather than guessing). Full-time / extra-time map
// to >=90 so the "remaining fraction" is 0.
export function parseLiveMinute(displayClock?: string, detail?: string, period?: number): number | null {
  const s = `${displayClock ?? ""} ${detail ?? ""}`.trim();
  const lower = s.toLowerCase();
  if (/half.?time|\bht\b/.test(lower)) return 45;
  if (/full.?time|\bft\b|\baet\b|\bpens?\b|penalt|after extra|\bend\b/.test(lower)) return 90; // regulation done
  const m = s.match(/(\d+)\s*'?(?:\s*\+\s*(\d+))?/); // "63'", "45'+2'", "90'+4'", "105'+1'"
  if (m) {
    const base = Number(m[1]);
    const extra = m[2] ? Number(m[2]) : 0;
    if (isFinite(base)) return base + extra;
  }
  if (period === 1) return 23; // rough half-midpoints when only the period is known
  if (period === 2) return 68;
  if (period && period >= 3) return 90; // extra time / shootout -> regulation already over
  return null;
}

// In-progress AND just-finished matches (ESPN state "in" or "post"). Fetched fresh per request so both
// the live score and the final score surface in real time, separate from the prediction cron. Neither
// moves standings/ratings (the cron recompute owns the model); this only lets a match show its current
// or final score the instant it changes, closing the gap between full-time and the next cron tick.
export async function fetchLive(): Promise<LiveMatch[]> {
  const res = await fetch(`${SCOREBOARD}?dates=20260611-20260719`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: EspnEvent[] };
  const out: LiveMatch[] = [];
  for (const e of data.events ?? []) {
    const comp = e.competitions?.[0];
    const espnState = comp?.status?.type?.state;
    if (!comp || (espnState !== "in" && espnState !== "post")) continue; // in-progress or just finished
    const state: "in" | "post" = espnState === "in" ? "in" : "post";
    const cs = comp.competitors ?? [];
    if (cs.length !== 2) continue;
    const home = cs.find((c) => c.homeAway === "home") ?? cs[0];
    const away = cs.find((c) => c.homeAway === "away") ?? cs[1];
    const ht = TEAM_BY_ESPN[home.team.displayName];
    const at = TEAM_BY_ESPN[away.team.displayName];
    if (!ht || !at) continue;
    out.push({
      homeCode: ht.code,
      awayCode: at.code,
      group: ht.group === at.group ? ht.group : null,
      homeGoals: Number(home.score),
      awayGoals: Number(away.score),
      state,
      date: e.date,
      detail: comp.status?.type?.shortDetail ?? comp.status?.type?.detail ?? comp.status?.displayClock ?? (state === "post" ? "FT" : "LIVE"),
      minute: state === "post" ? 90 : parseLiveMinute(comp.status?.displayClock, comp.status?.type?.shortDetail ?? comp.status?.type?.detail, comp.status?.period),
    });
  }
  return out;
}

// Live ratings = pre-tournament Elo with every completed match replayed (deterministic, no drift).
export function liveRatings(results: FetchedMatch[]): Ratings {
  const R: Ratings = Object.fromEntries(TEAMS.map((t) => [t.code, t.rating]));
  const weight = kWeight("FIFA World Cup");
  for (const m of results) {
    const [nh, na] = updateElo(R[m.homeCode], R[m.awayCode], m.homeGoals, m.awayGoals, { neutral: true, weight });
    R[m.homeCode] = nh;
    R[m.awayCode] = na;
  }
  return R;
}

// Ratings as they stood JUST BEFORE each completed match (results are date-sorted), keyed by sorted
// team pair. Lets a completed match show the model's genuine PRE-match read instead of a hindsight
// view computed from ratings that already absorbed the result.
export function preMatchRatingsByPair(results: FetchedMatch[]): Record<string, Ratings> {
  const R: Ratings = Object.fromEntries(TEAMS.map((t) => [t.code, t.rating]));
  const weight = kWeight("FIFA World Cup");
  const snap: Record<string, Ratings> = {};
  for (const m of results) {
    snap[[m.homeCode, m.awayCode].sort().join("-")] = { ...R }; // snapshot before applying this result
    const [nh, na] = updateElo(R[m.homeCode], R[m.awayCode], m.homeGoals, m.awayGoals, { neutral: true, weight });
    R[m.homeCode] = nh;
    R[m.awayCode] = na;
  }
  return snap;
}

// Build the 12 round-robin groups, filling in completed group-stage results. Optionally folds in LIVE
// (in-progress) group matches: a live fixture is left unplayed but tagged with its current score and the
// fraction of the match remaining, so the Monte Carlo conditions on it (a live lead shifts group/knockout
// odds) instead of simulating it from scratch. A live match with an unknown clock is frozen at its current
// score (treated as played) rather than guessed — safe, matching the deterministic standings layer.
export function buildGroupMatches(results: FetchedMatch[], live: LiveMatch[] = []): Record<string, GroupMatch[]> {
  const groups: Record<string, GroupMatch[]> = {};
  const byKey = new Map<string, FetchedMatch>();
  for (const m of results) {
    if (m.group == null || m.date.slice(0, 10) > GROUP_STAGE_END) continue;
    byKey.set([m.homeCode, m.awayCode].sort().join("-"), m);
  }
  const liveByKey = new Map<string, LiveMatch>();
  for (const l of live) {
    if (l.state !== "in" || l.group == null) continue;
    liveByKey.set([l.homeCode, l.awayCode].sort().join("-"), l);
  }
  for (const g of "ABCDEFGHIJKL") {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    groups[g] = roundRobin(g, codes).map((fixture) => {
      const key = [fixture.home, fixture.away].sort().join("-");
      const venue = VENUE_BY_PAIR.get(key);
      const r = byKey.get(key);
      if (r) {
        // orient the stored result to this fixture's home/away
        const sameOrient = r.homeCode === fixture.home;
        return {
          ...fixture,
          venue,
          played: true,
          homeGoals: sameOrient ? r.homeGoals : r.awayGoals,
          awayGoals: sameOrient ? r.awayGoals : r.homeGoals,
        };
      }
      const l = liveByKey.get(key);
      if (l) {
        const sameOrient = l.homeCode === fixture.home;
        const hg = sameOrient ? l.homeGoals : l.awayGoals;
        const ag = sameOrient ? l.awayGoals : l.homeGoals;
        // Known clock -> condition on the remaining fraction; unknown clock -> freeze at the current score.
        if (l.minute != null) {
          return { ...fixture, venue, live: { homeGoals: hg, awayGoals: ag, frac: fracRemaining(l.minute) } };
        }
        return { ...fixture, venue, played: true, homeGoals: hg, awayGoals: ag };
      }
      return { ...fixture, venue };
    });
  }
  return groups;
}

interface EspnEvent {
  date: string;
  competitions?: {
    status?: { displayClock?: string; period?: number; type?: { state?: string; detail?: string; shortDetail?: string } };
    competitors?: { homeAway?: string; score?: string | number; winner?: boolean; team: { displayName: string } }[];
  }[];
}
