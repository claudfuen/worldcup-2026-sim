// Build the Round of 32 from group results + third-place assignment, then simulate the bracket to a champion.
// Knockout advancement uses Elo win-expectancy (handles draws -> ET/penalties without modeling them explicitly).
import { KNOCKOUT } from "../data/bracket";
import { SCHEDULE_BY_MATCH } from "../data/schedule";
import type { Ratings } from "./types";
import { koAdvanceProb, liveKoAdvance } from "./poisson";
import { hostEloBoost } from "./hosts";

// A live (in-progress) knockout match, keyed by its sorted team-pair. The Monte Carlo conditions that
// match's advancement on the current score + time left instead of a fresh pre-match read, so a live KO
// result propagates to the rest of the bracket.
export type KOLive = Record<string, { homeCode: string; homeScore: number; awayScore: number; frac: number }>;

export interface GroupOutcome {
  // group letter -> [1st code, 2nd code, 3rd code, 4th code]
  [group: string]: string[];
}

// Resolve a slot reference to a team code, given group outcomes and the third-place slot assignment.
// Refs: "1A"/"2A" (winner/runner-up of group A), or "3:..." (third assigned to this match's host winner-slot).
function resolveGroupRef(ref: string, groups: GroupOutcome, slotToTeam: Record<string, string>, hostSlot: string): string {
  if (ref.startsWith("3:")) return slotToTeam[hostSlot];
  const pos = ref[0]; // '1' or '2'
  const g = ref.slice(1);
  return groups[g][pos === "1" ? 0 : 1];
}

export interface KnockoutResult {
  winners: Record<number, string>; // match number -> advancing team code
  losers: Record<number, string>;
  champion: string;
  runnerUp: string;
  semifinalists: string[];
  finalists: string[];
  reached: Record<string, Set<string>>; // round label -> set of team codes that reached it
  r32: Record<number, [string, string]>; // match -> [home, away] codes
  lineups: Record<number, [string, string]>; // every knockout match -> [home, away] this iteration
}

export function buildR32(groups: GroupOutcome, slotToTeam: Record<string, string>): Record<number, [string, string]> {
  const r32: Record<number, [string, string]> = {};
  for (const m of KNOCKOUT) {
    if (m.round !== "R32") continue;
    // The host winner-slot is the side that is a "1X"/"2X" (third refs always pair with a group-winner slot).
    const hostSlot = !m.home.startsWith("3:") ? m.home : m.away;
    const home = resolveGroupRef(m.home, groups, slotToTeam, hostSlot);
    const away = resolveGroupRef(m.away, groups, slotToTeam, hostSlot);
    r32[m.match] = [home, away];
  }
  return r32;
}

export interface KOPlayed {
  home: string; away: string; homeScore: number; awayScore: number; winner: string;
}

// Resolve the ACTUAL knockout results into the bracket: walk it forward from the (final) group outcome +
// Annex C third assignment, matching each completed knockout result to its match by team-pair. Returns the
// real winner/loser of every played match (so the sim can fix them) and the score oriented to the bracket's
// home/away (for display). A match whose participants aren't known yet (an earlier feeder unplayed) or that
// hasn't been played is simply absent. The winner comes from ESPN's advancing flag when present — essential
// for penalty shootouts, whose regulation score is a draw — falling back to the higher score.
export function resolveKnockoutResults(
  groups: GroupOutcome,
  slotToTeam: Record<string, string>,
  results: { homeCode: string; awayCode: string; homeGoals: number; awayGoals: number; winnerCode?: string | null }[],
): { winners: Record<number, string>; losers: Record<number, string>; played: Record<number, KOPlayed> } {
  const r32 = buildR32(groups, slotToTeam);
  const byPair = new Map(results.map((r) => [[r.homeCode, r.awayCode].sort().join("-"), r]));
  const winners: Record<number, string> = {};
  const losers: Record<number, string> = {};
  const played: Record<number, KOPlayed> = {};
  const ref = (s: string): string | undefined =>
    s.startsWith("W") ? winners[Number(s.slice(1))] : s.startsWith("L") ? losers[Number(s.slice(1))] : undefined;
  for (const m of KNOCKOUT) {
    const home = m.round === "R32" ? r32[m.match]?.[0] : ref(m.home);
    const away = m.round === "R32" ? r32[m.match]?.[1] : ref(m.away);
    if (!home || !away) continue; // participants not yet determined
    const r = byPair.get([home, away].sort().join("-"));
    if (!r) continue; // not played yet
    const sameOrient = r.homeCode === home;
    const homeScore = sameOrient ? r.homeGoals : r.awayGoals;
    const awayScore = sameOrient ? r.awayGoals : r.homeGoals;
    const winner = r.winnerCode === home || r.winnerCode === away ? r.winnerCode! : homeScore >= awayScore ? home : away;
    winners[m.match] = winner;
    losers[m.match] = winner === home ? away : home;
    played[m.match] = { home, away, homeScore, awayScore, winner };
  }
  return { winners, losers, played };
}

function playKO(homeCode: string, awayCode: string, ratings: Ratings, rand: () => number, venue: string): string {
  // Advancement = regulation + extra time + penalty coin-flip, with host advantage if applicable.
  const diff = (ratings[homeCode] ?? 1500) - (ratings[awayCode] ?? 1500) + hostEloBoost(homeCode, venue) - hostEloBoost(awayCode, venue);
  return rand() < koAdvanceProb(diff) ? homeCode : awayCode;
}

export function simulateKnockout(
  r32: Record<number, [string, string]>,
  ratings: Ratings,
  rand: () => number,
  decided: Record<number, string> = {}, // match -> ACTUAL winner (already played); overrides the simulated result
  liveKO: KOLive = {}, // in-progress KO matches (by sorted pair): advance conditioned on the live score
): KnockoutResult {
  const winners: Record<number, string> = {};
  const losers: Record<number, string> = {};
  const lineups: Record<number, [string, string]> = {};
  const reached: Record<string, Set<string>> = { R32: new Set(), R16: new Set(), QF: new Set(), SF: new Set(), F: new Set() };

  const resolveRef = (ref: string): string => {
    if (ref.startsWith("W")) return winners[Number(ref.slice(1))];
    if (ref.startsWith("L")) return losers[Number(ref.slice(1))];
    return ref; // already a code (R32 home/away injected below)
  };

  // Seed R32 reached set and a code-injected lookup for R32 matches.
  for (const [, [h, a]] of Object.entries(r32)) {
    reached.R32.add(h); reached.R32.add(a);
  }

  for (const m of KNOCKOUT) {
    let home: string, away: string;
    if (m.round === "R32") {
      [home, away] = r32[m.match];
    } else {
      home = resolveRef(m.home);
      away = resolveRef(m.away);
    }
    if (m.round === "R16" || m.round === "QF" || m.round === "SF") {
      reached[m.round].add(home); reached[m.round].add(away);
    }
    if (m.round === "F") { reached.F.add(home); reached.F.add(away); }
    lineups[m.match] = [home, away];
    if (m.round === "3P") continue; // third-place playoff doesn't affect our tallies
    // Played -> fixed to its real winner. In-progress -> advancement conditioned on the live score + time
    // left. Otherwise simulated fresh.
    const dw = decided[m.match];
    let w: string;
    if (dw === home || dw === away) {
      w = dw;
    } else {
      const venue = SCHEDULE_BY_MATCH[m.match]?.venue ?? "";
      const lk = liveKO[[home, away].sort().join("-")];
      if (lk) {
        const orient = lk.homeCode === home;
        const hg = orient ? lk.homeScore : lk.awayScore;
        const ag = orient ? lk.awayScore : lk.homeScore;
        const diff = (ratings[home] ?? 1500) - (ratings[away] ?? 1500) + hostEloBoost(home, venue) - hostEloBoost(away, venue);
        w = rand() < liveKoAdvance(diff, hg, ag, lk.frac) ? home : away;
      } else {
        w = playKO(home, away, ratings, rand, venue);
      }
    }
    winners[m.match] = w;
    losers[m.match] = w === home ? away : home;
  }

  const finalMatch = KNOCKOUT.find((m) => m.round === "F")!;
  const champion = winners[finalMatch.match];
  const runnerUp = losers[finalMatch.match];
  const sfMatches = KNOCKOUT.filter((m) => m.round === "SF").map((m) => m.match);
  const finalists = [champion, runnerUp];
  const semifinalists = [...new Set(sfMatches.flatMap((mn) => [winners[mn], losers[mn]]))];

  return { winners, losers, champion, runnerUp, semifinalists, finalists, reached, r32, lineups };
}
