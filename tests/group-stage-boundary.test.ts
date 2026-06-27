// Regression test for the group-vs-knockout split in lib/espn.ts.
//
// `buildGroupMatches` fills a group fixture from a completed result, but `group` is set on ANY result whose
// two teams share a group — including a knockout REMATCH of two same-group teams (possible from the Round of
// 16 on). A date cutoff (GROUP_STAGE_END) keeps those rematches out of the group table. The cutoff was once
// hardcoded "2026-06-27", which silently dropped the real Group J finals played on 2026-06-28 (matches 69 &
// 70) — freezing Group J and, since groupStageComplete = every group decided, preventing the whole bracket's
// third-place slots from ever locking. It's now derived from the schedule so it can't go stale.
import { describe, it, expect } from "vitest";
import { GROUP_STAGE_END, buildGroupMatches, type FetchedMatch } from "../lib/espn";

const algAut = (g: Record<string, { home: string; away: string; played?: boolean; homeGoals?: number; awayGoals?: number }[]>) =>
  g["J"].find((x) => [x.home, x.away].sort().join("-") === ["ALG", "AUT"].sort().join("-"))!;

describe("group-stage boundary (GROUP_STAGE_END)", () => {
  it("is the last group day from the schedule — 2026-06-28, not 06-27", () => {
    expect(GROUP_STAGE_END).toBe("2026-06-28");
  });

  it("fills a group match played on the final group day (06-28)", () => {
    const res: FetchedMatch[] = [{ date: "2026-06-28T02:00:00Z", homeCode: "ALG", awayCode: "AUT", group: "J", homeGoals: 1, awayGoals: 2 }];
    expect(algAut(buildGroupMatches(res)).played).toBe(true);
  });

  it("ignores a same-group knockout rematch (later date) so it can't overwrite group standings", () => {
    const res: FetchedMatch[] = [
      { date: "2026-06-28T02:00:00Z", homeCode: "ALG", awayCode: "AUT", group: "J", homeGoals: 1, awayGoals: 2 }, // group result
      { date: "2026-07-04T20:00:00Z", homeCode: "ALG", awayCode: "AUT", group: "J", homeGoals: 5, awayGoals: 0 }, // KO rematch — must be dropped
    ];
    const m = algAut(buildGroupMatches(res));
    expect(m.homeGoals! + m.awayGoals!).toBe(3); // the 2-1 group result stands, not the 5-0 rematch
  });
});
