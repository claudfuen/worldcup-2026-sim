// Deterministic group standings/clinch/status derivation, shared by the cron pipeline (predictions.ts)
// and the render-time live layer (liveProjection.ts) so both produce IDENTICAL group views from the same
// matches. Probabilities (winGroup/advance) come from the Monte Carlo, which only the cron can run, so
// they're injected via `probOf` rather than computed here.
import { rankGroup } from "./sim/standings";
import { computeClinch, minThirdPlacePoints, maxThirdPlacePoints, maxReachablePoints } from "./sim/clinch";
import type { GroupMatch, Ratings } from "./sim/types";
import type { ThirdTeam } from "./sim/thirdPlace";
import type { GroupView, GroupTeamView } from "./predictions";
import { TEAMS, TEAM_BY_CODE, GROUPS } from "./data/teams";

export interface GroupProb {
  winGroup: number;
  advance: number;
  advanceDelta?: number;
}
export type ProbOf = (code: string) => GroupProb;

// Plain-language "what your team needs" for its last group match - only when one result gives a
// clean, mathematically guaranteed answer (otherwise the advance % already tells the story).
function nextMatchNeed(code: string, codes: string[], gm: GroupMatch[]): string | undefined {
  const rem = gm.filter((m) => !m.played && (m.home === code || m.away === code));
  if (rem.length !== 1) return undefined; // only the common one-match-left case
  const m = rem[0];
  const oppCode = m.home === code ? m.away : m.home;
  const opp = TEAM_BY_CODE[oppCode]?.name ?? oppCode;
  const xHome = m.home === code;
  const variant = (res: "W" | "D" | "L"): GroupMatch[] =>
    gm.map((g) => {
      if (g !== m) return g;
      const hg = res === "D" ? 0 : xHome ? (res === "W" ? 1 : 0) : res === "W" ? 0 : 1;
      const ag = res === "D" ? 0 : xHome ? (res === "W" ? 0 : 1) : res === "W" ? 1 : 0;
      return { ...m, played: true, homeGoals: hg, awayGoals: ag };
    });
  const cW = computeClinch(codes, variant("W"))[code];
  const cD = computeClinch(codes, variant("D"))[code];
  const cL = computeClinch(codes, variant("L"))[code];
  const lossOut = cL.eliminatedTop2 && cL.eliminatedTop3;
  if (cD.top2) return `A draw vs ${opp} secures a top-2 spot.`;
  if (cW.top2) return lossOut ? `Beat ${opp} to go through - a loss is out.` : `Beat ${opp} to lock a top-2 spot.`;
  if (lossOut) return `Beat ${opp} to stay alive - a loss is out.`;
  return undefined; // no single result settles it; the advance % covers this case
}

// Build the 12 group views (ranked rows + definitive clinch status) from group matches. Definitive states
// (won_group/second/advanced/eliminated) come from clinch MATH; everything else stays "live" (a probability,
// never shown as 100%/✓). Cross-group best-third certainty uses sound min/max third-place point bounds.
export function buildGroupViews(
  groupMatches: Record<string, GroupMatch[]>,
  ratings: Ratings,
  probOf: ProbOf,
): { groups: GroupView[]; thirdRows: ThirdTeam[] } {
  // Worst/best-case 3rd-place points per group — sound bounds for cross-group best-third certainty.
  const minThirdByGroup: Record<string, number> = {};
  const maxThirdByGroup: Record<string, number> = {};
  for (const g of GROUPS) {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    minThirdByGroup[g] = minThirdPlacePoints(codes, groupMatches[g]);
    maxThirdByGroup[g] = maxThirdPlacePoints(codes, groupMatches[g]);
  }

  const thirdRows: ThirdTeam[] = [];
  const groups: GroupView[] = GROUPS.map((g) => {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    const rows = rankGroup(codes, groupMatches[g], ratings);
    thirdRows.push({ group: g, row: rows[2] });
    const decided = groupMatches[g].every((m) => m.played);
    const clinch = computeClinch(codes, groupMatches[g], ratings); // mathematical certainty, not sim probability
    return {
      group: g,
      decided,
      teams: rows.map((r) => {
        const cl = clinch[r.code];
        // Mathematically eliminated: out of top-2 AND best-3rd path is impossible
        // (>=8 other groups guarantee a 3rd-placed team with more points than this team can reach).
        let eliminated = cl.eliminatedTop3;
        if (!eliminated && cl.eliminatedTop2) {
          const maxThird = maxReachablePoints(r.code, groupMatches[g]);
          const betterGroups = GROUPS.filter((og) => og !== g && minThirdByGroup[og] > maxThird).length;
          eliminated = betterGroups >= 8;
        }
        // Clinched via best-third: guaranteed top-3 AND <=7 other groups could field a better third.
        const advancedByThird =
          !cl.top2 && cl.guaranteedTop3 &&
          GROUPS.filter((og) => og !== g && maxThirdByGroup[og] >= r.pts).length <= 7;
        // Definitive states come from math; otherwise it's a probability (never shown as 100%/✓).
        const status: GroupTeamView["status"] =
          cl.winner ? "won_group"
            : cl.second ? "second"
            : cl.top2 || advancedByThird ? "advanced"
            : eliminated ? "eliminated"
            : "live";
        const p = probOf(r.code);
        return {
          code: r.code, name: TEAM_BY_CODE[r.code].name, played: r.played, w: r.w, d: r.d, l: r.l,
          gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts, winGroup: p.winGroup, advance: p.advance,
          advanceDelta: p.advanceDelta, status,
          need: status === "live" ? nextMatchNeed(r.code, codes, groupMatches[g]) : undefined,
        };
      }),
    };
  });
  return { groups, thirdRows };
}

// Knockout slots resolve to a definite team only when mathematically locked: a clinched group winner
// fills its "1X" slot, a clinched runner-up its "2X" slot. (W## / 3rd slots stay projected.)
export function lockedSlotsFromGroups(groups: GroupView[]): Record<string, string> {
  const lockedSlot: Record<string, string> = {};
  for (const gv of groups) {
    const w = gv.teams.find((t) => t.status === "won_group");
    if (w) lockedSlot["1" + gv.group] = w.code;
    const s = gv.teams.find((t) => t.status === "second");
    if (s) lockedSlot["2" + gv.group] = s.code;
  }
  return lockedSlot;
}
