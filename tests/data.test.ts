import { describe, it, expect } from "vitest";
import { TEAMS, GROUPS } from "../lib/data/teams";
import { KNOCKOUT } from "../lib/data/bracket";
import { THIRD_PLACE_TABLE } from "../lib/data/thirdPlaceTable";

describe("teams data integrity", () => {
  it("has 48 teams across 12 groups of 4", () => {
    expect(TEAMS.length).toBe(48);
    expect(GROUPS.length).toBe(12);
    for (const g of GROUPS) expect(TEAMS.filter((t) => t.group === g).length).toBe(4);
  });
  it("has unique team codes and plausible ratings", () => {
    expect(new Set(TEAMS.map((t) => t.code)).size).toBe(48);
    for (const t of TEAMS) expect(t.rating).toBeGreaterThan(1200);
  });
  it("places the three hosts (Mexico, Canada, USA) in distinct groups A/B/D", () => {
    const grp = (name: string) => TEAMS.find((t) => t.name === name)!.group;
    expect(grp("Mexico")).toBe("A");
    expect(grp("Canada")).toBe("B");
    expect(grp("United States")).toBe("D");
  });
});

describe("bracket data integrity", () => {
  it("has 32 knockout matches in the expected per-round counts", () => {
    const count = (r: string) => KNOCKOUT.filter((m) => m.round === r).length;
    expect(count("R32")).toBe(16);
    expect(count("R16")).toBe(8);
    expect(count("QF")).toBe(4);
    expect(count("SF")).toBe(2);
    expect(count("3P")).toBe(1);
    expect(count("F")).toBe(1);
    expect(KNOCKOUT.length).toBe(32);
  });
  it("encodes the red-team-corrected R16 feeders (M89=W74vW77, M90=W73vW75)", () => {
    const m89 = KNOCKOUT.find((m) => m.match === 89)!;
    const m90 = KNOCKOUT.find((m) => m.match === 90)!;
    expect([m89.home, m89.away]).toEqual(["W74", "W77"]);
    expect([m90.home, m90.away]).toEqual(["W73", "W75"]);
  });
});

describe("third-place table integrity (495 combinations)", () => {
  it("has exactly 495 combinations, each a key of 8 distinct sorted A-L letters", () => {
    const keys = Object.keys(THIRD_PLACE_TABLE);
    expect(keys.length).toBe(495);
    for (const k of keys) {
      expect(k.length).toBe(8);
      expect([...k]).toEqual([...k].sort()); // sorted
      expect(new Set(k).size).toBe(8); // distinct
      expect([...k].every((c) => "ABCDEFGHIJKL".includes(c))).toBe(true);
    }
  });
  it("assigns each slot a third drawn only from the advancing groups in that combination", () => {
    for (const [key, val] of Object.entries(THIRD_PLACE_TABLE)) {
      expect(val.length).toBe(8);
      const adv = new Set(key);
      expect([...val].every((c) => adv.has(c))).toBe(true);
      expect(new Set(val)).toEqual(adv); // a permutation of the 8 advancing groups
    }
  });
});
