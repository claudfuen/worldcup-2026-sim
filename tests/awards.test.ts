// Awards (Golden Boot + assists): aggregation correctness (own goals excluded, penalties counted, assists
// credited) and forecast sanity (deterministic, monotone in current tally, normalized win probabilities).
import { describe, it, expect } from "vitest";
import { computeAwards, aggregateScorers } from "../lib/awards";
import type { MatchInfo } from "../lib/predictions";
import type { TeamProb } from "../lib/sim/simulate";
import type { MatchSummary, MatchEvent } from "../lib/matchEvents";

const goal = (teamCode: string, player: string, assist?: string, goalType: "goal" | "penalty" | "own" = "goal"): MatchEvent => ({
  kind: "goal", minute: "10'", sortMinute: 10, teamCode, player, assist, goalType,
});

const mkMatch = (match: number, home: string, away: string, status: MatchInfo["status"] = "final", round = "GROUP"): MatchInfo =>
  ({ match, home, away, status, round } as MatchInfo);

const team = (over: Partial<TeamProb>): TeamProb => ({
  code: "X", group: "A", winGroup: 0, runnerUp: 0, third: 0, advance: 0, r16: 0, qf: 0, sf: 0, final: 0, title: 0, ...over,
});

// AAA goes deep; BBB exits early. One match played: 2 goals for Ava (AAA), 1 for Ben (BBB, assisted by Cal),
// one penalty for Ava, and an own goal by Dex (AAA) — which must NOT credit Dex.
const summaries: Record<number, MatchSummary> = {
  1: {
    events: [
      goal("AAA", "Ava"),
      goal("AAA", "Ava", undefined, "penalty"),
      goal("BBB", "Ben", "Cal"),
      goal("AAA", "Dex", undefined, "own"),
    ],
    stats: null,
  },
};
const getSummary = async (m: MatchInfo): Promise<MatchSummary> => summaries[m.match] ?? { events: [], stats: null };
const matches = [mkMatch(1, "AAA", "BBB"), mkMatch(2, "AAA", "CCC", "scheduled")];
const teams: Record<string, TeamProb> = {
  AAA: team({ code: "AAA", advance: 0.9, r16: 0.7, qf: 0.5, sf: 0.3, final: 0.15 }),
  BBB: team({ code: "BBB", advance: 0.2, r16: 0.05, qf: 0.01, sf: 0, final: 0 }),
};

describe("aggregateScorers", () => {
  it("counts goals + penalties, credits assists, and excludes own goals", async () => {
    const { tallies, matchesCounted } = await aggregateScorers(matches, getSummary);
    expect(matchesCounted).toBe(1); // only the final match (scheduled skipped)
    const ava = tallies.find((t) => t.player === "Ava")!;
    expect(ava.goals).toBe(2);
    expect(ava.penalties).toBe(1);
    const cal = tallies.find((t) => t.player === "Cal")!;
    expect(cal.assists).toBe(1);
    expect(cal.goals).toBe(0);
    // own goal does not credit the scorer
    expect(tallies.find((t) => t.player === "Dex")).toBeUndefined();
  });
});

describe("computeAwards", () => {
  it("ranks the Golden Boot by goals and is deterministic for a seed", async () => {
    const a = await computeAwards(matches, teams, getSummary, 123);
    const b = await computeAwards(matches, teams, getSummary, 123);
    expect(a.goldenBoot[0].player).toBe("Ava");
    expect(a.goldenBoot[0].goals).toBe(2);
    expect(a.goldenBoot.map((e) => [e.player, e.winProb])).toEqual(b.goldenBoot.map((e) => [e.player, e.winProb]));
  });

  it("makes the higher scorer on the deeper team the favourite, and projects beyond the current tally", async () => {
    const { goldenBoot } = await computeAwards(matches, teams, getSummary, 123);
    const ava = goldenBoot.find((e) => e.player === "Ava")!;
    const ben = goldenBoot.find((e) => e.player === "Ben")!;
    expect(ava.winProb).toBeGreaterThan(ben.winProb);
    expect(ava.projected).toBeGreaterThan(ava.goals); // forecast adds expected future goals
  });

  it("win probabilities are a valid distribution over candidates (sum ≈ 1)", async () => {
    const { goldenBoot } = await computeAwards(matches, teams, getSummary, 123);
    const total = goldenBoot.reduce((s, e) => s + e.winProb, 0);
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThanOrEqual(1.0001);
  });

  it("credits assists on their own board", async () => {
    const { assists } = await computeAwards(matches, teams, getSummary, 123);
    expect(assists[0].player).toBe("Cal");
    expect(assists[0].assists).toBe(1);
  });
});
