// resolveKnockoutResults maps completed knockout results onto the bracket and fixes each played match's
// winner — including penalty shootouts, where the regulation score is a draw and only ESPN's advancing
// flag (winnerCode) reveals who went through. It also propagates W## feeders forward.
import { describe, it, expect } from "vitest";
import { buildR32, resolveKnockoutResults } from "../lib/sim/knockout";
import { selectAndAssignThirds } from "../lib/sim/thirdPlace";
import { rankGroup } from "../lib/sim/standings";
import { KNOCKOUT } from "../lib/data/bracket";
import { TEAMS, GROUPS } from "../lib/data/teams";

const ratings = Object.fromEntries(TEAMS.map((t) => [t.code, 1500]));
// A plausible final group outcome: each group's 4 teams in listed order (deterministic, enough to seed the bracket).
const groupOutcome: Record<string, string[]> = {};
const thirds = [];
for (const g of GROUPS) {
  const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
  groupOutcome[g] = codes;
  thirds.push({ group: g, row: rankGroup(codes, [], ratings)[2] }); // 0 matches played → arbitrary but valid 3rd row
}
const { slotToTeam } = selectAndAssignThirds(thirds, ratings);
const r32 = buildR32(groupOutcome, slotToTeam);

describe("resolveKnockoutResults", () => {
  it("decides a penalty shootout by the advancing flag, not the (drawn) score", () => {
    const [home, away] = r32[73];
    const res = [{ homeCode: home, awayCode: away, homeGoals: 1, awayGoals: 1, winnerCode: away }];
    const { winners, losers, played } = resolveKnockoutResults(groupOutcome, slotToTeam, res);
    expect(winners[73]).toBe(away); // shootout winner via the flag
    expect(losers[73]).toBe(home);
    expect(played[73]).toMatchObject({ home, away, homeScore: 1, awayScore: 1, winner: away });
  });

  it("orients the score to the bracket's home/away even if ESPN lists them the other way", () => {
    const [home, away] = r32[73];
    const res = [{ homeCode: away, awayCode: home, homeGoals: 2, awayGoals: 0, winnerCode: away }];
    const { played } = resolveKnockoutResults(groupOutcome, slotToTeam, res);
    expect(played[73]).toMatchObject({ homeScore: 0, awayScore: 2, winner: away }); // re-oriented to bracket home(=home)
  });

  it("propagates a played R32 winner into its R16 feeder, and leaves unplayed matches absent", () => {
    const r16 = KNOCKOUT.find((m) => m.round === "R16" && (m.home.startsWith("W") || m.away.startsWith("W")))!;
    const feederNo = Number((m => (m.home.startsWith("W") ? m.home : m.away))(r16).slice(1));
    const [home, away] = r32[feederNo];
    const res = [{ homeCode: home, awayCode: away, homeGoals: 3, awayGoals: 0, winnerCode: home }];
    const { winners, played } = resolveKnockoutResults(groupOutcome, slotToTeam, res);
    expect(winners[feederNo]).toBe(home);
    expect(played[r16.match]).toBeUndefined(); // the R16 itself hasn't been played
  });

  it("returns nothing when no knockout results are supplied", () => {
    const { winners, played } = resolveKnockoutResults(groupOutcome, slotToTeam, []);
    expect(Object.keys(winners)).toHaveLength(0);
    expect(Object.keys(played)).toHaveLength(0);
  });
});
