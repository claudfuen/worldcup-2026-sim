// Canonical squad positions from ESPN's per-team roster endpoint. Unlike the matchday lineups (which label
// every benched player "Substitute", so a player who never starts has no resolvable position — the Ochoa
// problem), the roster carries each of the 26 squad members' real position. This map fills positions for
// EVERYONE, including perma-substitutes. Best-effort: any failure leaves the map empty and callers fall back
// to the match-derived position.
import { cache } from "react";
import { TEAM_BY_ESPN } from "./data/teams";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, SQUAD_POS_KEY } from "./kv";
import { positionGroup } from "./matchEvents";

const TEAMS_LIST = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams";
const ROSTER = (id: string) => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${id}/roster`;

// name|teamCode -> GK / DF / MF / FW
export type SquadPositions = Record<string, string>;

interface EspnTeamsList {
  sports?: { leagues?: { teams?: { team?: { id?: string; displayName?: string } }[] }[] }[];
}
interface EspnAthlete {
  displayName?: string;
  position?: { name?: string; abbreviation?: string };
  items?: EspnAthlete[]; // some roster shapes group athletes under a position bucket
}
interface EspnRoster {
  athletes?: EspnAthlete[];
}

// Flatten the roster's athletes (handles both the flat list and the grouped {position, items} shape).
function flattenAthletes(athletes: EspnAthlete[] | undefined): EspnAthlete[] {
  const out: EspnAthlete[] = [];
  for (const a of athletes ?? []) {
    if (a.items?.length) out.push(...a.items);
    else if (a.displayName) out.push(a);
  }
  return out;
}

async function fetchSquadPositions(): Promise<SquadPositions> {
  const out: SquadPositions = {};
  const list = (await (await fetch(TEAMS_LIST, { cache: "no-store" })).json()) as EspnTeamsList;
  const teams = list.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const idToCode: [string, string][] = [];
  for (const t of teams) {
    const id = t.team?.id;
    const code = t.team?.displayName ? TEAM_BY_ESPN[t.team.displayName]?.code : undefined;
    if (id && code) idToCode.push([id, code]);
  }
  await Promise.all(
    idToCode.map(async ([id, code]) => {
      try {
        const r = (await (await fetch(ROSTER(id), { cache: "no-store" })).json()) as EspnRoster;
        for (const a of flattenAthletes(r.athletes)) {
          const name = a.displayName;
          const pos = positionGroup(a.position?.name ?? a.position?.abbreviation);
          if (name && pos) out[`${name}|${code}`] = pos;
        }
      } catch {
        /* one team's roster failed — skip it, the rest still fill in */
      }
    }),
  );
  return out;
}

// KV-cached for a day (squads are stable once announced), React-cached per request. The cron refreshes KV on
// its schedule; reads outside the TTL recompute lazily.
const SQUAD_TTL = 24 * 60 * 60_000;

export const getSquadPositions = cache(async (): Promise<SquadPositions> => {
  if (KV_CONFIGURED) {
    try {
      const c = await kvGetJSON<{ at: number; p: SquadPositions }>(SQUAD_POS_KEY);
      if (c && Date.now() - c.at < SQUAD_TTL) return c.p;
    } catch {
      /* fall through to a fresh fetch */
    }
  }
  const p = await fetchSquadPositions().catch(() => ({}) as SquadPositions);
  if (KV_CONFIGURED && Object.keys(p).length) await kvSetJSON(SQUAD_POS_KEY, { at: Date.now(), p }).catch(() => {});
  return p;
});
