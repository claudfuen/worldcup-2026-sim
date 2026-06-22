// Live ingestion from ESPN's public FIFA World Cup feed (no key required).
import { TEAM_BY_ESPN, TEAMS } from "./data/teams";
import { updateElo, kWeight } from "./sim/elo";
import { roundRobin } from "./sim/simulate";
import { SCHEDULE } from "./data/schedule";
import type { GroupMatch, Ratings } from "./sim/types";

// venue per group fixture (by sorted team pair), from the canonical schedule
const VENUE_BY_PAIR = new Map<string, string>(
  SCHEDULE.filter((m) => m.round === "GROUP" && m.home && m.away).map((m) => [[m.home!, m.away!].sort().join("-"), m.venue]),
);

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const GROUP_STAGE_END = "2026-06-27";

export interface FetchedMatch {
  date: string;
  homeCode: string;
  awayCode: string;
  group: string | null; // same group => group-stage match
  homeGoals: number;
  awayGoals: number;
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
  detail: string; // e.g. "45'+3'", "HT" - the live clock/state from ESPN
}

// In-progress matches only (ESPN state "in"). Fetched fresh per request so live scores are real-time,
// separate from the 30-min prediction cron. A live result does NOT move standings/ratings (FIFA tables
// update at full time); it's surfaced as a live score on the schedule/match pages.
export async function fetchLive(): Promise<LiveMatch[]> {
  const res = await fetch(`${SCOREBOARD}?dates=20260611-20260719`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: EspnEvent[] };
  const out: LiveMatch[] = [];
  for (const e of data.events ?? []) {
    const comp = e.competitions?.[0];
    if (!comp || comp.status?.type?.state !== "in") continue; // in-progress only
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
      detail: comp.status?.type?.shortDetail ?? comp.status?.type?.detail ?? comp.status?.displayClock ?? "LIVE",
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

// Build the 12 round-robin groups, filling in completed group-stage results.
export function buildGroupMatches(results: FetchedMatch[]): Record<string, GroupMatch[]> {
  const groups: Record<string, GroupMatch[]> = {};
  const byKey = new Map<string, FetchedMatch>();
  for (const m of results) {
    if (m.group == null || m.date.slice(0, 10) > GROUP_STAGE_END) continue;
    byKey.set([m.homeCode, m.awayCode].sort().join("-"), m);
  }
  for (const g of "ABCDEFGHIJKL") {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    groups[g] = roundRobin(g, codes).map((fixture) => {
      const venue = VENUE_BY_PAIR.get([fixture.home, fixture.away].sort().join("-"));
      const r = byKey.get([fixture.home, fixture.away].sort().join("-"));
      if (!r) return { ...fixture, venue };
      // orient the stored result to this fixture's home/away
      const sameOrient = r.homeCode === fixture.home;
      return {
        ...fixture,
        venue,
        played: true,
        homeGoals: sameOrient ? r.homeGoals : r.awayGoals,
        awayGoals: sameOrient ? r.awayGoals : r.homeGoals,
      };
    });
  }
  return groups;
}

interface EspnEvent {
  date: string;
  competitions?: {
    status?: { displayClock?: string; type?: { state?: string; detail?: string; shortDetail?: string } };
    competitors?: { homeAway?: string; score?: string | number; team: { displayName: string } }[];
  }[];
}
