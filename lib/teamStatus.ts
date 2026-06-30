import type { MatchInfo } from "./predictions";

// Shared "is this a fact yet?" helpers for a team's knockout progress — so reach-by-round displays show a
// definitive ✓ / Eliminated from actual results instead of a capped Monte Carlo % once the outcome is known.
// Used by the team-page round funnel and the match-page Tournament Outlook.

const ROUND_OF: Record<string, string> = { advance: "R32", r16: "R16", qf: "QF", sf: "SF", final: "FINAL" };

// True when the team has MATHEMATICALLY reached this round: it's a resolved participant of a match in that
// round (the bracket resolves W## feeders once played), or — for the title — it won the final. Note: R32
// via this check requires the slot to be resolved; a clinched best-third may not be (the slot only locks
// once the qualifying set is known), so callers with the group clinch status should prefer that for R32.
export function hasReachedRound(matches: MatchInfo[], code: string, roundKey: string): boolean {
  if (roundKey === "title") return matches.some((m) => m.round === "FINAL" && m.status === "final" && m.winner === code);
  const r = ROUND_OF[roundKey];
  return !!r && matches.some((m) => m.round === r && (m.home === code || m.away === code));
}

// True when the team is out: it lost a played knockout tie, or can't even reach the R32 (group-stage out).
export function isEliminated(matches: MatchInfo[], code: string, advanceProb: number): boolean {
  if (advanceProb === 0) return true;
  return matches.some((m) => m.status === "final" && m.winner != null && m.winner !== code && (m.home === code || m.away === code));
}
