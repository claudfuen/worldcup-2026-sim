import type { TFunction } from "./server";
import type {
  PredictionsPayload,
  MatchInfo,
  TeamPrediction,
  GroupView,
  ThirdPlaceEntry,
  SlotCandidate,
  OpponentProb,
} from "@/lib/predictions";

// Localize team display NAMES in a payload (and its derived structures) via the `teams.<code>` catalog.
// Every name in the payload is paired with a team code, so this is a pure code→localized-name remap.
//
// IMPORTANT: apply this AFTER the live transforms (overlayLive is name-safe, but finalizeGroups/
// finalizeBracket RE-DERIVE English names from TEAM_BY_CODE) — i.e. localize the FINAL structures a page
// renders, right before passing them to components. getT() falls back to English per-key, so an
// unlaunched/partial locale still shows the English name rather than a missing key.

const cand = (t: TFunction) => (c: SlotCandidate): SlotCandidate => ({ ...c, name: t(`teams.${c.code}`) });
const opp = (t: TFunction) => (o: OpponentProb): OpponentProb => ({ ...o, name: t(`teams.${o.code}`) });

export function localizeTeams(teams: TeamPrediction[], t: TFunction): TeamPrediction[] {
  return teams.map((x) => ({ ...x, name: t(`teams.${x.code}`) }));
}

export function localizeTeam(team: TeamPrediction, t: TFunction): TeamPrediction {
  return { ...team, name: t(`teams.${team.code}`) };
}

export function localizeGroups(groups: GroupView[], t: TFunction): GroupView[] {
  return groups.map((g) => ({ ...g, teams: g.teams.map((x) => ({ ...x, name: t(`teams.${x.code}`) })) }));
}

export function localizeMatches(matches: MatchInfo[], t: TFunction): MatchInfo[] {
  return matches.map((m) => ({
    ...m,
    homeName: m.home ? t(`teams.${m.home}`) : m.homeName,
    awayName: m.away ? t(`teams.${m.away}`) : m.awayName,
    projHome: m.projHome?.map(cand(t)),
    projAway: m.projAway?.map(cand(t)),
    topMatchups: m.topMatchups?.map((mu) => ({
      ...mu,
      homeName: t(`teams.${mu.home}`),
      awayName: t(`teams.${mu.away}`),
    })),
    favorite: m.favorite ? { ...m.favorite, name: t(`teams.${m.favorite.code}`) } : m.favorite,
  }));
}

export function localizeMatch(m: MatchInfo, t: TFunction): MatchInfo {
  return localizeMatches([m], t)[0];
}

export function localizeThird(entries: ThirdPlaceEntry[], t: TFunction): ThirdPlaceEntry[] {
  return entries.map((e) => ({
    ...e,
    name: t(`teams.${e.code}`),
    opponent: e.opponent ? { ...e.opponent, name: t(`teams.${e.opponent.code}`) } : e.opponent,
    opponents: e.opponents?.map(opp(t)),
  }));
}

export function localizeR32Opponents(
  rec: Record<string, OpponentProb[]>,
  t: TFunction,
): Record<string, OpponentProb[]> {
  const out: Record<string, OpponentProb[]> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = v.map(opp(t));
  return out;
}

/** Localize an entire payload's names in one call (teams, groups, matches, thirdPlaceRace, r32Opponents). */
export function localizePayload(p: PredictionsPayload, t: TFunction): PredictionsPayload {
  return {
    ...p,
    teams: localizeTeams(p.teams, t),
    groups: localizeGroups(p.groups, t),
    matches: localizeMatches(p.matches, t),
    thirdPlaceRace: localizeThird(p.thirdPlaceRace, t),
    r32Opponents: localizeR32Opponents(p.r32Opponents, t),
  };
}
