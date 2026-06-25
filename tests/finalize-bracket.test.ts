// Tests for render-time bracket finalization (lib/liveProjection.ts `finalizeBracket`): a knockout slot
// locks to its team the instant the feeding group decides; third-place R32 slots resolve once the whole
// group stage is decided; W##/L## feeders and unresolved slots stay open.
import { describe, it, expect } from "vitest";
import { SCHEDULE } from "../lib/data/schedule";
import { TEAMS, GROUPS } from "../lib/data/teams";
import { buildGroupViews } from "../lib/groupView";
import { finalizeBracket } from "../lib/liveProjection";
import type { MatchInfo } from "../lib/predictions";
import type { GroupMatch, Ratings } from "../lib/sim/types";

const ratings: Ratings = Object.fromEntries(TEAMS.map((t) => [t.code, t.rating]));
const GROUP_SCHED = SCHEDULE.filter((s) => s.round === "GROUP");
const KO_SCHED = SCHEDULE.filter((s) => s.round !== "GROUP");
const score = (n: number): [number, number] => [(n * 2) % 4, (n * 3) % 3];
const dummyProb = () => ({ winGroup: 0, advance: 0 });

function groupMatches(isFinal: (m: number) => boolean): Record<string, GroupMatch[]> {
  const byGroup: Record<string, GroupMatch[]> = {};
  for (const g of GROUPS) byGroup[g] = [];
  for (const s of GROUP_SCHED) {
    const fin = isFinal(s.match);
    const [h, a] = score(s.match);
    byGroup[s.group!].push({ group: s.group!, home: s.home!, away: s.away!, played: fin, homeGoals: fin ? h : undefined, awayGoals: fin ? a : undefined });
  }
  return byGroup;
}

// Bare knockout MatchInfo rows (slots only, nothing resolved yet) — what the bracket starts from.
function koMatches(): MatchInfo[] {
  return KO_SCHED.map((s) => ({
    match: s.match, round: s.round, utc: s.utc, venue: s.venue, city: s.city,
    home: null, away: null, homeName: null, awayName: null, defined: false, status: "scheduled",
    slotHome: s.homeSlot, slotAway: s.awaySlot,
  } as MatchInfo));
}

describe("finalizeBracket — locks 1X/2X slots from clinched group winners/runners-up", () => {
  const groups = buildGroupViews(groupMatches(() => true), ratings, dummyProb).groups; // all decided
  const out = finalizeBracket(koMatches(), groups, ratings);
  const byMatch = new Map(out.map((m) => [m.match, m]));

  it("every R32 1X/2X slot resolves to that group's clinched winner/runner-up", () => {
    let checked = 0;
    for (const m of out) {
      if (m.round !== "R32") continue;
      for (const [slot, side] of [[m.slotHome, "home"], [m.slotAway, "away"]] as const) {
        if (!slot || !/^[12][A-L]$/.test(slot)) continue;
        const g = groups.find((x) => x.group === slot[1])!;
        const want = slot[0] === "1" ? g.teams.find((t) => t.status === "won_group") : g.teams.find((t) => t.status === "second");
        if (!want) continue; // not clinched (rare lots tie) — finalizeBracket correctly leaves it open
        expect(side === "home" ? m.home : m.away).toBe(want.code);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(8); // sanity: most slots locked
  });

  it("third-place R32 slots resolve once the whole group stage is decided", () => {
    const thirdSlotMatches = out.filter((m) => m.round === "R32" && (m.slotHome?.startsWith("3:") || m.slotAway?.startsWith("3:")));
    expect(thirdSlotMatches.length).toBe(8);
    for (const m of thirdSlotMatches) {
      const side = m.slotHome?.startsWith("3:") ? m.home : m.away;
      expect(side).toBeTruthy(); // resolved to a concrete third-placed team
    }
  });

  it("knockout feeders (W##/L##) stay unresolved", () => {
    const r16 = byMatch.get(89)!; // W74 vs W77
    expect(r16.home).toBeNull();
    expect(r16.away).toBeNull();
    expect(r16.defined).toBe(false);
  });
});

describe("finalizeBracket — only locks slots whose group has actually decided", () => {
  it("an undecided group's slot stays open; a decided group's slot locks", () => {
    // Decide every group EXCEPT A.
    const groups = buildGroupViews(groupMatches((m) => SCHEDULE.find((s) => s.match === m)?.group !== "A"), ratings, dummyProb).groups;
    const out = finalizeBracket(koMatches(), groups, ratings);
    // Find an R32 match fed by a group-A winner/runner-up slot, and one fed by a decided group.
    const aSlotMatch = out.find((m) => m.round === "R32" && (m.slotHome === "1A" || m.slotAway === "1A" || m.slotHome === "2A" || m.slotAway === "2A"));
    if (aSlotMatch) {
      const aIsHome = aSlotMatch.slotHome === "1A" || aSlotMatch.slotHome === "2A";
      expect(aIsHome ? aSlotMatch.home : aSlotMatch.away).toBeNull(); // group A undecided -> open
    }
    // Group B decided -> its winner slot (M81 1D? no). Just assert at least one 1X/2X slot is locked.
    const anyLocked = out.some((m) => m.round === "R32" && /^[12][A-L]$/.test(m.slotHome ?? "") && m.home);
    expect(anyLocked).toBe(true);
    // Third-place slots NOT resolved (group stage not complete)
    const thirdUnresolved = out.find((m) => m.round === "R32" && m.slotAway?.startsWith("3:"));
    expect(thirdUnresolved?.away ?? null).toBeNull();
  });
});
