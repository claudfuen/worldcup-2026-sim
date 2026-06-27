// Select the 8 best third-placed teams (of 12) and assign them to host slots via the verified 495-row Annex C table.
// Third-place ranking (cross-group, NO head-to-head): points -> overall GD -> overall GF -> conduct -> FIFA ranking.
import type { TeamRow, Ratings } from "./types";
import { THIRD_PLACE_TABLE, TP_SLOT_ORDER } from "../data/thirdPlaceTable";

export interface ThirdTeam {
  group: string;
  row: TeamRow;
}

// Rank all 12 third-placed teams; return them in order (best first).
export function rankThirds(thirds: ThirdTeam[], ratings: Ratings): ThirdTeam[] {
  return [...thirds].sort((a, b) => {
    const av = [a.row.pts, a.row.gd, a.row.gf, ratings[a.row.code] ?? 0];
    const bv = [b.row.pts, b.row.gd, b.row.gf, ratings[b.row.code] ?? 0];
    for (let i = 0; i < av.length; i++) if (av[i] !== bv[i]) return bv[i] - av[i];
    return 0;
  });
}

export interface ThirdAssignment {
  // group letter -> code of that group's 3rd-place team (only the 8 advancing groups)
  advancingByGroup: Record<string, string>;
  // host winner-slot (e.g. "1A") -> code of the 3rd-place team it faces
  slotToTeam: Record<string, string>;
}

// thirds: the 12 third-placed teams (one per group). Returns selection + slot assignment, or null if <8 supplied.
export function selectAndAssignThirds(thirds: ThirdTeam[], ratings: Ratings): ThirdAssignment {
  const ranked = rankThirds(thirds, ratings);
  const advancing = ranked.slice(0, 8);
  const advancingByGroup: Record<string, string> = {};
  for (const t of advancing) advancingByGroup[t.group] = t.row.code;

  const key = advancing.map((t) => t.group).sort().join("");
  const assignment = THIRD_PLACE_TABLE[key];
  if (!assignment) throw new Error(`No third-place table entry for combination "${key}"`);

  const slotToTeam: Record<string, string> = {};
  for (let i = 0; i < TP_SLOT_ORDER.length; i++) {
    const slot = TP_SLOT_ORDER[i];
    const groupLetter = assignment[i]; // group whose 3rd-placed team fills this slot
    slotToTeam[slot] = advancingByGroup[groupLetter];
  }
  return { advancingByGroup, slotToTeam };
}

// A third's Round-of-32 bracket slot is a pure function of WHICH 8 groups' thirds advance (the Annex C
// key is just those 8 group letters sorted), NOT of the internal ranking. So once a group's third is
// GUARANTEED to advance, its slot is locked the moment that group maps to the same slot in every Annex C
// row that could still apply. We scan every row whose key contains all `guaranteedGroups` and contains NO
// `eliminatedGroups` (a superset of the still-reachable qualifying sets); a guaranteed group that lands on a
// single slot across all of them has a slot that can no longer change. Scanning the superset keeps this
// sound — it can only ever UNDER-claim a lock, never assert one the reachable subset would contradict.
// Excluding eliminated groups is essential: a group whose 3rd is already out can never be in the set, so
// counting rows that include it would spuriously make a slot look variable (this is what hid Ecuador's lock).
// Returns group letter -> the locked winner-slot (e.g. "D" -> "1D"); groups whose slot still varies are omitted.
export function lockedThirdSlots(guaranteedGroups: string[], eliminatedGroups: string[] = []): Record<string, string> {
  const elim = new Set(eliminatedGroups);
  const slotsSeen: Record<string, Set<string>> = {};
  for (const g of guaranteedGroups) slotsSeen[g] = new Set();
  for (const [key, assignment] of Object.entries(THIRD_PLACE_TABLE)) {
    if (!guaranteedGroups.every((g) => key.includes(g))) continue;
    if ([...key].some((c) => elim.has(c))) continue; // impossible set (contains an eliminated 3rd) — skip
    for (const g of guaranteedGroups) slotsSeen[g].add(TP_SLOT_ORDER[assignment.indexOf(g)]);
  }
  const locked: Record<string, string> = {};
  for (const g of guaranteedGroups) {
    if (slotsSeen[g].size === 1) locked[g] = [...slotsSeen[g]][0];
  }
  return locked;
}
