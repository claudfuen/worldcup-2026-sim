import { describe, it, expect } from "vitest";
import { parseKeyEvents, redCardCount } from "../lib/matchEvents";
import { liveEloAdjustment } from "../lib/sim/poisson";

// ESPN keyEvents shapes (minimal). "England"/"Panama" map to ENG/PAN via TEAM_BY_ESPN.
const goal = (text: string, clock: string, team: string, scorer: string, assist?: string) => ({
  type: { text }, clock: { displayValue: clock }, team: { displayName: team }, scoringPlay: true,
  participants: [{ athlete: { displayName: scorer } }, ...(assist ? [{ athlete: { displayName: assist } }] : [])],
});
const card = (text: string, clock: string, team: string, player: string) => ({
  type: { text }, clock: { displayValue: clock }, team: { displayName: team }, scoringPlay: false,
  participants: [{ athlete: { displayName: player } }],
});

describe("parseKeyEvents", () => {
  it("parses goals (scorer + assist), penalties, own goals, and cards; sorts by minute", () => {
    const evs = parseKeyEvents([
      card("Yellow Card", "60'", "England", "Jarell Quansah"),
      goal("Goal - Header", "67'", "England", "Harry Kane", "Jude Bellingham"),
      goal("Penalty - Scored", "30'", "Panama", "Some Striker"),
      goal("Own Goal", "75'", "Panama", "Own Scorer"),
      card("Red Card", "82'", "Panama", "Sent Off"),
      card("VAR - (Red) Card Upgrade", "85'", "England", "Upgraded"),
    ] as never);

    expect(evs.map((e) => e.minute)).toEqual(["30'", "60'", "67'", "75'", "82'", "85'"]); // sorted

    const kane = evs.find((e) => e.player === "Harry Kane")!;
    expect(kane.kind).toBe("goal");
    expect(kane.goalType).toBe("goal");
    expect(kane.assist).toBe("Jude Bellingham");
    expect(kane.teamCode).toBe("ENG");

    expect(evs.find((e) => e.player === "Some Striker")!.goalType).toBe("penalty");
    expect(evs.find((e) => e.player === "Own Scorer")!.goalType).toBe("own");

    expect(evs.find((e) => e.player === "Sent Off")!.card).toBe("red");
    expect(evs.find((e) => e.player === "Upgraded")!.card).toBe("red"); // VAR upgrade
    expect(evs.find((e) => e.player === "Jarell Quansah")!.card).toBe("yellow");
  });

  it("parses substitutions (participants[0] on, [1] off)", () => {
    const evs = parseKeyEvents([
      {
        type: { text: "Substitution" }, clock: { displayValue: "63'" }, team: { displayName: "England" }, scoringPlay: false,
        participants: [{ athlete: { displayName: "Djed Spence" } }, { athlete: { displayName: "Jarell Quansah" } }],
      },
    ] as never);
    expect(evs).toHaveLength(1);
    expect(evs[0].kind).toBe("sub");
    expect(evs[0].player).toBe("Djed Spence"); // on
    expect(evs[0].playerOff).toBe("Jarell Quansah"); // off
    expect(evs[0].teamCode).toBe("ENG");
  });

  it("orders stoppage time after the minute (45'+2' between 45' and 46')", () => {
    const evs = parseKeyEvents([
      card("Yellow Card", "46'", "England", "C"),
      card("Yellow Card", "45'", "England", "A"),
      card("Yellow Card", "45'+2'", "England", "B"),
    ] as never);
    expect(evs.map((e) => e.player)).toEqual(["A", "B", "C"]);
  });
});

describe("redCardCount", () => {
  it("counts reds per side by team code", () => {
    const evs = parseKeyEvents([
      card("Red Card", "82'", "Panama", "X"),
      card("Yellow Card", "20'", "Panama", "Y"),
      card("Red Card", "90'", "England", "Z"),
    ] as never);
    expect(redCardCount(evs, "ENG", "PAN")).toEqual({ home: 1, away: 1 });
  });
});

describe("liveEloAdjustment", () => {
  it("is zero with no in-game edge", () => {
    expect(liveEloAdjustment({}, 0.5)).toBe(0);
  });
  it("a red card against the home side lowers the home rating gap, more so earlier", () => {
    const early = liveEloAdjustment({ redHome: 1 }, 0.9);
    const late = liveEloAdjustment({ redHome: 1 }, 0.1);
    expect(early).toBeLessThan(0);
    expect(late).toBeLessThan(0);
    expect(early).toBeLessThan(late); // earlier red = bigger handicap
  });
  it("shot/possession dominance nudges toward the dominant side, weighted later in the match", () => {
    const g = { sotHome: 6, sotAway: 1, shotsHome: 15, shotsAway: 4, possHome: 65, possAway: 35 };
    const earlyLowData = liveEloAdjustment(g, 0.9); // little of the match observed -> small
    const lateHighData = liveEloAdjustment(g, 0.1); // most observed -> larger
    expect(earlyLowData).toBeGreaterThan(0);
    expect(lateHighData).toBeGreaterThan(earlyLowData);
  });

  it("multiple red cards have diminishing returns (2nd card costs less than the 1st)", () => {
    const one = Math.abs(liveEloAdjustment({ redHome: 1 }, 0.6));
    const two = Math.abs(liveEloAdjustment({ redHome: 2 }, 0.6));
    expect(two).toBeGreaterThan(one); // still worse
    expect(two).toBeLessThan(2 * one); // but not twice as bad
  });

  it("dominance is kept orthogonal to the scoreline: damped when it agrees with the lead, kept when behind", () => {
    const dom = { sotHome: 6, sotAway: 1, shotsHome: 16, shotsAway: 4 };
    const level = liveEloAdjustment({ ...dom, goalDiff: 0 }, 0.5);
    const leading = liveEloAdjustment({ ...dom, goalDiff: 1 }, 0.5); // home dominating AND ahead
    const trailing = liveEloAdjustment({ ...dom, goalDiff: -1 }, 0.5); // home dominating but behind
    expect(leading).toBeLessThan(level); // already priced into the lead -> damped
    expect(trailing).toBeGreaterThan(leading); // behind + dominating is genuine new info
    expect(trailing).toBeCloseTo(level, 0); // (and ~= the level case)
  });

  it("the joint nudge is bounded even when everything stacks", () => {
    const huge = liveEloAdjustment({ redAway: 3, sotHome: 25, sotAway: 0, shotsHome: 40, shotsAway: 1, possHome: 80, possAway: 20 }, 0.9);
    expect(Math.abs(huge)).toBeLessThanOrEqual(350);
  });
});
