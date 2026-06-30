import type { MatchInfo } from "./predictions";
import type { PathRound, PathCandidate } from "./teamPath";

// "Who would the winner of THIS tie have to beat to reach the final?" — walk the bracket forward from a
// knockout match along its winner feeder (W{match} → the one match that consumes it) to the final, reading
// the OTHER side of each downstream node as the opponent. Like the team-page road-to-final, but anchored at
// a match rather than a team, so it works before either participant is known. Honours clinch-vs-probability:
// a resolved/played opponent is definite; an open one returns the top-N projected candidates (lead first).

export interface MatchPathStep {
  round: PathRound;
  match: MatchInfo; // the downstream bracket node (for link / time / venue)
  oppLocked: { code: string; name: string } | null; // a single, definite opponent (clinched or played)
  oppCandidates: PathCandidate[]; // else the top-N projected opponents (lead first)
}

// Returns the rounds AFTER `from` on the winner's road to the final (empty for the final, the third-place
// play-off, or a group match — none of which feed a single W{match} slot).
export function matchForwardPath(matches: MatchInfo[], from: MatchInfo): MatchPathStep[] {
  const steps: MatchPathStep[] = [];
  let cur: MatchInfo | undefined = from;
  while (cur) {
    const w: string = `W${cur.match}`;
    const next: MatchInfo | undefined = matches.find((m) => m.slotHome === w || m.slotAway === w);
    if (!next) break;
    const advSide: "home" | "away" = next.slotHome === w ? "home" : "away"; // the slot our advancer fills
    const oppSide = advSide === "home" ? "away" : "home";
    const oppCode = oppSide === "home" ? next.home : next.away;
    const oppName = oppSide === "home" ? next.homeName : next.awayName;
    const oppProj = (oppSide === "home" ? next.projHome : next.projAway) ?? [];
    steps.push({
      round: next.round as PathRound,
      match: next,
      oppLocked: oppCode && oppName ? { code: oppCode, name: oppName } : null,
      oppCandidates: oppCode ? [] : oppProj.slice(0, 3).map((c) => ({ code: c.code, name: c.name, prob: c.prob })),
    });
    cur = next;
  }
  return steps;
}
