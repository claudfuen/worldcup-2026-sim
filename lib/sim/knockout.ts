// Build the Round of 32 from group results + third-place assignment, then simulate the bracket to a champion.
// Knockout advancement uses Elo win-expectancy (handles draws -> ET/penalties without modeling them explicitly).
import { KNOCKOUT } from "../data/bracket";
import type { Ratings } from "./types";
import { expectedScore } from "./elo";

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

function playKO(homeCode: string, awayCode: string, ratings: Ratings, rand: () => number): string {
  // Neutral venue; advancement probability = Elo win expectancy (win + half the draws resolved in ET/pens).
  const pHome = expectedScore((ratings[homeCode] ?? 1500) - (ratings[awayCode] ?? 1500));
  return rand() < pHome ? homeCode : awayCode;
}

export function simulateKnockout(
  r32: Record<number, [string, string]>,
  ratings: Ratings,
  rand: () => number,
): KnockoutResult {
  const winners: Record<number, string> = {};
  const losers: Record<number, string> = {};
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
    if (m.round === "3P") continue; // third-place playoff doesn't affect our tallies
    const w = playKO(home, away, ratings, rand);
    winners[m.match] = w;
    losers[m.match] = w === home ? away : home;
  }

  const finalMatch = KNOCKOUT.find((m) => m.round === "F")!;
  const champion = winners[finalMatch.match];
  const runnerUp = losers[finalMatch.match];
  const sfMatches = KNOCKOUT.filter((m) => m.round === "SF").map((m) => m.match);
  const finalists = [champion, runnerUp];
  const semifinalists = [...new Set(sfMatches.flatMap((mn) => [winners[mn], losers[mn]]))];

  return { winners, losers, champion, runnerUp, semifinalists, finalists, reached, r32 };
}
