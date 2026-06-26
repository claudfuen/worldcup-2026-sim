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
//
// `groupMatches` is the RANKING set — what the displayed table (order, GD, points) reflects; pass live
// scores frozen in here to show in-progress standings. `clinchMatches` is the CERTAINTY set — what ✓/out
// and `decided` are computed from; it must contain only FULL-TIME results so an unfinished live score can
// never produce a premature clinch. They're the same object for the cron (final-only); the render-time
// live layer passes live-frozen for ranking and final-only for clinch.
export function buildGroupViews(
  groupMatches: Record<string, GroupMatch[]>,
  ratings: Ratings,
  probOf: ProbOf,
  clinchMatches: Record<string, GroupMatch[]> = groupMatches,
): { groups: GroupView[]; thirdRows: ThirdTeam[] } {
  // Worst/best-case 3rd-place points per group — sound bounds for cross-group best-third certainty (final-only).
  const minThirdByGroup: Record<string, number> = {};
  const maxThirdByGroup: Record<string, number> = {};
  // Whether each group is fully played, and its SETTLED 3rd-place row (pts/GD/GF final) — used to compare
  // two decided groups' thirds on the real tiebreakers, not points alone (a decided third tied on points
  // but behind on GD/GF can no longer overtake).
  const decidedByGroup: Record<string, boolean> = {};
  const settledThirdByGroup: Record<string, { pts: number; gd: number; gf: number }> = {};
  for (const g of GROUPS) {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    minThirdByGroup[g] = minThirdPlacePoints(codes, clinchMatches[g]);
    maxThirdByGroup[g] = maxThirdPlacePoints(codes, clinchMatches[g]);
    decidedByGroup[g] = clinchMatches[g].every((m) => m.played);
    const sr = rankGroup(codes, clinchMatches[g], ratings)[2];
    settledThirdByGroup[g] = { pts: sr.pts, gd: sr.gd, gf: sr.gf };
  }

  const thirdRows: ThirdTeam[] = [];
  const groups: GroupView[] = GROUPS.map((g) => {
    const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
    const rows = rankGroup(codes, groupMatches[g], ratings); // ranking set (may include live-frozen scores)
    thirdRows.push({ group: g, row: rows[2] });
    const decided = clinchMatches[g].every((m) => m.played); // "decided" = all FULL-TIME, never live
    const clinch = computeClinch(codes, clinchMatches[g], ratings); // certainty from full-time results only
    return {
      group: g,
      decided,
      teams: rows.map((r) => {
        const cl = clinch[r.code];
        // Mathematically eliminated: out of top-2 AND best-3rd path is impossible
        // (>=8 other groups guarantee a 3rd-placed team with more points than this team can reach).
        let eliminated = cl.eliminatedTop3;
        if (!eliminated && cl.eliminatedTop2) {
          const maxThird = maxReachablePoints(r.code, clinchMatches[g]);
          const betterGroups = GROUPS.filter((og) => og !== g && minThirdByGroup[og] > maxThird).length;
          eliminated = betterGroups >= 8;
        }
        // Clinched via best-third (guaranteed to REACH the Round of 32 — NOT a specific bracket slot, which
        // the Annex C assignment only fixes once the qualifying set of 8 groups is known). A team guaranteed
        // top-3 in its own group is a top-8 third iff at most 7 OTHER groups could field a third ranked above
        // it. For a group still playing, goals are unbounded, so any third that can reach this team's points
        // could overtake it on goals (compare by max points, `>=`). For TWO already-decided groups, GD/GF are
        // settled, so we compare the real tiebreakers (pts -> GD -> GF); a tie all the way to GF is left
        // ambiguous (conduct/FIFA fallback) and so still counted. The settled-vs-settled branch only applies
        // when this team's own group is decided too (otherwise its GD/GF aren't final to compare against).
        const advancedByThird =
          !cl.top2 && cl.guaranteedTop3 &&
          GROUPS.filter((og) => {
            if (og === g) return false;
            if (decided && decidedByGroup[og]) {
              const ot = settledThirdByGroup[og];
              return ot.pts !== r.pts ? ot.pts > r.pts : ot.gd !== r.gd ? ot.gd > r.gd : ot.gf >= r.gf;
            }
            return maxThirdByGroup[og] >= r.pts;
          }).length <= 7;
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
          need: status === "live" ? nextMatchNeed(r.code, codes, clinchMatches[g]) : undefined,
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
