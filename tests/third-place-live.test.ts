// Tests for the render-time, live-aware third-place race (lib/liveProjection.ts `liveThirdPlaceRace`).
// It re-ranks the 12 third-placed teams over the "if the live score holds" snapshot so the race table
// stays consistent with the live group cards: a group with an in-progress match contributes its
// PROVISIONAL 3rd, every other group its official 3rd. Top 8 advance.
import { describe, it, expect } from "vitest";
import { liveThirdPlaceRace } from "../lib/liveProjection";
import type { ProvisionalGroup } from "../lib/liveProjection";
import type { GroupView, GroupTeamView } from "../lib/predictions";
import type { TeamRow, Ratings } from "../lib/sim/types";

// Minimal GroupView whose 3rd-place row (index 2) carries the stats the race reads. Codes are the group
// letter repeated so each "third" is a distinct, identifiable team.
function groupWith(letter: string, third: { pts: number; gd: number; gf: number }): GroupView {
  const code = `T${letter}`;
  const blank = (c: string): GroupTeamView => ({
    code: c, name: c, played: 3, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0,
    winGroup: 0, advance: 0, status: "live",
  });
  const thirdRow: GroupTeamView = {
    ...blank(code), gf: third.gf, ga: third.gf - third.gd, gd: third.gd, pts: third.pts,
  };
  return {
    group: letter,
    decided: true,
    teams: [blank(`1${letter}`), blank(`2${letter}`), thirdRow, blank(`4${letter}`)],
  };
}

const LETTERS = "ABCDEFGHIJKL".split("");
// 12 groups whose thirds have strictly decreasing points (A best ... L worst), so the top-8 cut is
// unambiguous: groups A..H advance, I..L are out.
const GROUPS: GroupView[] = LETTERS.map((l, i) => groupWith(l, { pts: 12 - i, gd: 0, gf: 0 }));
const ratings: Ratings = Object.fromEntries(GROUPS.flatMap((g) => g.teams.map((t) => [t.code, 1500])));

describe("liveThirdPlaceRace — no live matches (pure cron-standings reconstruction)", () => {
  const provByGroup: Record<string, ProvisionalGroup | null> = Object.fromEntries(LETTERS.map((l) => [l, null]));
  const race = liveThirdPlaceRace(GROUPS, provByGroup, ratings);

  it("ranks all 12 thirds best-first by points", () => {
    expect(race.map((e) => e.group)).toEqual(LETTERS);
    expect(race[0].pts).toBe(12);
    expect(race[11].pts).toBe(1);
  });
  it("marks exactly the top 8 as advancing", () => {
    expect(race.filter((e) => e.advancing).map((e) => e.group)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(race.filter((e) => !e.advancing).map((e) => e.group)).toEqual(["I", "J", "K", "L"]);
  });
  it("ranks are 1..12 in order", () => {
    expect(race.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe("liveThirdPlaceRace — applies the 2026 cross-group tiebreakers (pts -> GD -> GF)", () => {
  it("breaks equal points by goal difference, then goals for", () => {
    const gs = [
      groupWith("A", { pts: 4, gd: 1, gf: 5 }),
      groupWith("B", { pts: 4, gd: 3, gf: 3 }), // same pts, better GD -> ranks above A
      groupWith("C", { pts: 4, gd: 3, gf: 9 }), // ties B on pts+GD, more GF -> ranks above B
    ];
    const r: Ratings = Object.fromEntries(gs.flatMap((g) => g.teams.map((t) => [t.code, 1500])));
    const prov: Record<string, ProvisionalGroup | null> = { A: null, B: null, C: null };
    const race = liveThirdPlaceRace(gs, prov, r);
    expect(race.map((e) => e.group)).toEqual(["C", "B", "A"]);
  });
});

describe("liveThirdPlaceRace — a live (in-progress) group contributes its PROVISIONAL third", () => {
  it("uses prov.rows[2] for live groups and re-ranks the cut accordingly", () => {
    // Group I's official 3rd has 4 pts (would be 9th, just outside the cut). A live result lifts its
    // provisional 3rd to 99 pts, so it should jump to 1st and push the previous 8th (H) out.
    const provThird: TeamRow = {
      code: "TI", played: 3, w: 0, d: 0, l: 0, gf: 50, ga: 0, gd: 50, pts: 99,
    };
    const prov: ProvisionalGroup = {
      group: "I",
      rows: [provThird, provThird, provThird, provThird], // only index 2 is read
      clinch: {},
      live: [],
    };
    const provByGroup: Record<string, ProvisionalGroup | null> = Object.fromEntries(
      LETTERS.map((l) => [l, l === "I" ? prov : null]),
    );
    const race = liveThirdPlaceRace(GROUPS, provByGroup, ratings);

    expect(race[0].group).toBe("I"); // provisional surge puts it top
    expect(race[0].pts).toBe(99);
    const advancing = race.filter((e) => e.advancing).map((e) => e.group);
    expect(advancing).toContain("I");
    expect(advancing).not.toContain("H"); // previously 8th, now bumped to 9th
    expect(advancing).toHaveLength(8);
  });
});
