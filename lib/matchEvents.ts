// Per-match timeline (goals + cards) from ESPN's `summary` endpoint. Separate from the prediction model —
// purely descriptive "what happened" facts shown on the match page for live and completed matches. Backed
// by a short KV cache (longer for finished matches) so it never hammers ESPN.
import { cache } from "react";
import { TEAM_BY_ESPN } from "./data/teams";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, MATCH_EVENTS_KEY } from "./kv";
import type { MatchInfo } from "./predictions";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";

export interface MatchEvent {
  kind: "goal" | "card" | "sub";
  minute: string; // ESPN clock, e.g. "62'", "90'+3'"
  sortMinute: number; // numeric, for ordering (45'+2' -> 45.02)
  teamCode: string | null; // internal team code (mapped from ESPN), if resolvable
  player: string; // scorer / carded player / player coming ON
  assist?: string; // open-play goals only
  goalType?: "goal" | "penalty" | "own";
  card?: "yellow" | "red";
  playerOff?: string; // substitutions: the player going off (player = the one coming on)
}

export interface TeamStats {
  possession: number | null; // %
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  fouls: number | null;
  saves: number | null;
  passPct: number | null; // 0..1
}
export interface MatchStats {
  home: TeamStats;
  away: TeamStats;
}
export interface ShootoutKick {
  player: string;
  scored: boolean;
  order: number; // ESPN shotNumber (1-based, per team)
}
export interface LineupPlayer {
  player: string;
  position: string; // normalized: GK / DF / MF / FW (empty if unknown)
  starter: boolean;
  subbedIn: boolean; // came on as a substitute (played without starting)
  subbedOut: boolean; // was replaced
}
export interface MatchSummary {
  events: MatchEvent[];
  stats: MatchStats | null;
  // Penalty shootout takers per side (oriented home/away), in order — only present for a tie settled on pens.
  shootout?: { home: ShootoutKick[]; away: ShootoutKick[] } | null;
  // Matchday squads per side (oriented home/away) — the source for full-squad player coverage incl. keepers.
  lineups?: { home: LineupPlayer[]; away: LineupPlayer[] } | null;
}

// ESPN's descriptive position name → a simple GK/DF/MF/FW group. Classify by NAME ("Goalkeeper",
// "Left Back", "Defensive Midfielder", "Forward", "Substitute"), which is far more reliable than the
// abbreviation. Unknown / "Substitute" returns "" — never guess a position (a benched keeper is not a forward).
export function positionGroup(name?: string): string {
  if (!name) return "";
  const s = name.toLowerCase();
  if (s.includes("keeper")) return "GK"; // "Goalkeeper", "Sweeper Keeper" — note "sweeper" alone is NOT a keeper
  if (s.includes("defender") || s.includes("back") || s.includes("sweeper")) return "DF"; // incl. wing-back, centre-back, sweeper
  if (s.includes("midfield")) return "MF";
  if (s.includes("forward") || s.includes("striker") || s.includes("winger") || s.includes("wing")) return "FW";
  return ""; // "Substitute" / unknown — leave unset rather than mislabel
}

// "62'" -> 62, "45'+2'" -> 45.02 (stoppage sorts after the minute, before the next).
function sortMinute(clock: string): number {
  const m = clock.match(/(\d+)(?:\s*\+\s*(\d+))?/);
  if (!m) return 0;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0);
}

const espnCode = (name?: string): string | null => (name ? TEAM_BY_ESPN[name]?.code ?? null : null);

interface EspnKeyEvent {
  type?: { text?: string };
  clock?: { displayValue?: string };
  team?: { displayName?: string };
  scoringPlay?: boolean;
  participants?: { athlete?: { displayName?: string } }[];
}

interface EspnBoxTeam {
  team?: { displayName?: string };
  statistics?: { name?: string; displayValue?: string }[];
}

interface EspnShootoutTeam {
  team?: string; // ESPN display name (a string here, not an object)
  shots?: { player?: string; shotNumber?: number; didScore?: boolean }[];
}

interface EspnRosterTeam {
  team?: { displayName?: string };
  roster?: { athlete?: { displayName?: string }; position?: { name?: string; abbreviation?: string }; starter?: boolean; subbedIn?: boolean; subbedOut?: boolean }[];
}

// Parse ESPN's `rosters` (matchday squads, incl. goalkeepers) into per-side lineups, oriented home/away.
function parseLineups(rosters: EspnRosterTeam[] | undefined, homeCode: string, awayCode: string): { home: LineupPlayer[]; away: LineupPlayer[] } | null {
  if (!rosters?.length) return null;
  const side = (code: string): LineupPlayer[] => {
    const t = rosters.find((r) => espnCode(r.team?.displayName) === code);
    return (t?.roster ?? [])
      .map((p) => ({ player: p.athlete?.displayName ?? "", position: positionGroup(p.position?.name ?? p.position?.abbreviation), starter: !!p.starter, subbedIn: !!p.subbedIn, subbedOut: !!p.subbedOut }))
      .filter((p) => p.player);
  };
  const home = side(homeCode);
  const away = side(awayCode);
  if (!home.length && !away.length) return null;
  return { home, away };
}

// Parse ESPN's `shootout` (one entry per team, each with ordered `shots`) into per-side taker lists,
// oriented to the bracket's home/away. Returns null when there was no shootout.
function parseShootout(so: EspnShootoutTeam[] | undefined, homeCode: string, awayCode: string): { home: ShootoutKick[]; away: ShootoutKick[] } | null {
  if (!so?.length) return null;
  const side = (code: string): ShootoutKick[] => {
    const t = so.find((s) => espnCode(s.team) === code);
    return (t?.shots ?? [])
      .map((sh) => ({ player: sh.player ?? "", scored: !!sh.didScore, order: sh.shotNumber ?? 0 }))
      .sort((a, b) => a.order - b.order);
  };
  const home = side(homeCode);
  const away = side(awayCode);
  if (!home.length && !away.length) return null;
  return { home, away };
}

// Pull the headline match stats for both sides from the boxscore, oriented to the bracket's home/away.
function parseBoxscore(teams: EspnBoxTeam[] | undefined, homeCode: string, awayCode: string): MatchStats | null {
  if (!teams?.length) return null;
  const read = (bt: EspnBoxTeam): TeamStats => {
    const get = (name: string): number | null => {
      const v = bt.statistics?.find((s) => s.name === name)?.displayValue;
      if (v == null) return null;
      const n = Number(v);
      return isFinite(n) ? n : null;
    };
    return {
      possession: get("possessionPct"),
      shots: get("totalShots"),
      shotsOnTarget: get("shotsOnTarget"),
      corners: get("wonCorners"),
      fouls: get("foulsCommitted"),
      saves: get("saves"),
      passPct: get("passPct"),
    };
  };
  const home = teams.find((t) => espnCode(t.team?.displayName) === homeCode);
  const away = teams.find((t) => espnCode(t.team?.displayName) === awayCode);
  if (!home || !away) return null;
  return { home: read(home), away: read(away) };
}

// Net red cards per side from the parsed timeline (used by the live win-probability model).
export function redCardCount(events: MatchEvent[], homeCode: string, awayCode: string): { home: number; away: number } {
  let home = 0, away = 0;
  for (const e of events) {
    if (e.kind !== "card" || e.card !== "red") continue;
    if (e.teamCode === homeCode) home++;
    else if (e.teamCode === awayCode) away++;
  }
  return { home, away };
}

// Parse ESPN keyEvents into goals + cards. Goal/own-goal/penalty are distinguished by type.text (the
// boolean flags come back empty); cards by whether the type mentions "Red" (covers VAR red upgrades).
export function parseKeyEvents(keyEvents: EspnKeyEvent[] | undefined): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (const k of keyEvents ?? []) {
    const t = k.type?.text ?? "";
    const minute = k.clock?.displayValue ?? "";
    const teamCode = espnCode(k.team?.displayName);
    if (k.scoringPlay) {
      const player = k.participants?.[0]?.athlete?.displayName;
      if (!player) continue;
      const goalType = /own goal/i.test(t) ? "own" : /penalt/i.test(t) ? "penalty" : "goal";
      const assist = goalType === "goal" ? k.participants?.[1]?.athlete?.displayName : undefined;
      out.push({ kind: "goal", minute, sortMinute: sortMinute(minute), teamCode, player, assist, goalType });
    } else if (/card/i.test(t)) {
      const player = k.participants?.[0]?.athlete?.displayName;
      if (!player) continue;
      out.push({ kind: "card", minute, sortMinute: sortMinute(minute), teamCode, player, card: /red/i.test(t) ? "red" : "yellow" });
    } else if (/substitution/i.test(t)) {
      // ESPN "X replaces Y": participants[0] comes on, participants[1] goes off.
      const on = k.participants?.[0]?.athlete?.displayName;
      const off = k.participants?.[1]?.athlete?.displayName;
      if (!on) continue;
      out.push({ kind: "sub", minute, sortMinute: sortMinute(minute), teamCode, player: on, playerOff: off });
    }
  }
  return out.sort((a, b) => a.sortMinute - b.sortMinute);
}

// Date window (±1 day, UTC) so a late-night kickoff that ESPN files under the adjacent date is still found.
function dateWindow(iso: string): string {
  const d = new Date(iso);
  const fmt = (off: number) => new Date(d.getTime() + off * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  return `${fmt(-1)}-${fmt(1)}`;
}

// Look up the ESPN event for a match (by team pair within its date window), then pull + parse its timeline
// AND headline stats. Returns an empty summary on any miss/error — the panel is a nice-to-have, never
// load-bearing.
export async function fetchMatchSummary(homeCode: string, awayCode: string, utc: string): Promise<MatchSummary> {
  const sb = (await (await fetch(`${SCOREBOARD}?dates=${dateWindow(utc)}`, { cache: "no-store" })).json()) as {
    events?: { id: string; competitions?: { competitors?: { team?: { displayName?: string } }[] }[] }[];
  };
  let eventId: string | null = null;
  for (const e of sb.events ?? []) {
    const codes = (e.competitions?.[0]?.competitors ?? []).map((c) => espnCode(c.team?.displayName));
    if (codes.includes(homeCode) && codes.includes(awayCode)) { eventId = e.id; break; }
  }
  if (!eventId) return { events: [], stats: null };
  return fetchEventSummary(eventId, homeCode, awayCode);
}

// Pull + parse a summary directly from a known ESPN event id (skips the scoreboard lookup). Used by the cron,
// which already holds event ids from the live feed.
export async function fetchEventSummary(eventId: string, homeCode: string, awayCode: string): Promise<MatchSummary> {
  const sum = (await (await fetch(`${SUMMARY}?event=${eventId}`, { cache: "no-store" })).json()) as {
    keyEvents?: EspnKeyEvent[];
    boxscore?: { teams?: EspnBoxTeam[] };
    shootout?: EspnShootoutTeam[];
    rosters?: EspnRosterTeam[];
  };
  return {
    events: parseKeyEvents(sum.keyEvents),
    stats: parseBoxscore(sum.boxscore?.teams, homeCode, awayCode),
    shootout: parseShootout(sum.shootout, homeCode, awayCode),
    lineups: parseLineups(sum.rosters, homeCode, awayCode),
  };
}

// Cached per-match summary (timeline + stats). Live matches refresh every ~15s; finished matches are
// effectively immutable so they're cached for hours. Scheduled matches skip the fetch entirely. cache()
// dedupes within one render.
export const getMatchSummary = cache(async (m: MatchInfo): Promise<MatchSummary> => {
  const empty: MatchSummary = { events: [], stats: null };
  if (m.status === "scheduled" || !m.home || !m.away) return empty;
  const ttl = m.status === "live" ? 15_000 : 6 * 60 * 60_000;
  const key = `${MATCH_EVENTS_KEY}:${m.match}`;
  if (KV_CONFIGURED) {
    try {
      const c = await kvGetJSON<{ at: number; s: MatchSummary }>(key);
      if (c && Date.now() - c.at < ttl) return c.s;
    } catch {
      /* fall through to a fresh fetch */
    }
  }
  const s = await fetchMatchSummary(m.home, m.away, m.utc).catch(() => empty);
  if (KV_CONFIGURED) await kvSetJSON(key, { at: Date.now(), s }).catch(() => {});
  return s;
});
