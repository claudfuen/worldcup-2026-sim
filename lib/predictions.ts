// End-to-end: pull live results -> live ratings -> Monte Carlo -> assemble the payload stored in KV / rendered.
import { fetchResults, liveRatings, preMatchRatingsByPair, buildGroupMatches, type FetchedMatch } from "./espn";
import { runMonteCarlo } from "./sim/simulate";
import { rankGroup } from "./sim/standings";
import { computeClinch, minThirdPlacePoints, maxThirdPlacePoints, maxReachablePoints } from "./sim/clinch";
import { rankThirds, selectAndAssignThirds, type ThirdTeam } from "./sim/thirdPlace";
import { wdlProbs, eloToLambdas, scorelineDist } from "./sim/poisson";
import { hostEloBoost } from "./sim/hosts";
import type { GroupMatch } from "./sim/types";
import { TEAMS, TEAM_BY_CODE, GROUPS } from "./data/teams";
import { SCHEDULE } from "./data/schedule";
import { KNOCKOUT } from "./data/bracket";
import type { TeamProb } from "./sim/simulate";

export interface TeamPrediction extends TeamProb {
  name: string;
  rating: number;
}
export interface GroupTeamView {
  code: string; name: string; played: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number; winGroup: number; advance: number;
  // certainty flips from probability to a definitive state once locked
  status: "won_group" | "second" | "advanced" | "eliminated" | "live";
  need?: string; // plain-language 'what you need in your last match', when there's a clean answer
}
export interface GroupView {
  group: string;
  teams: GroupTeamView[];
  decided: boolean; // all 6 matches played
}
export interface OpponentProb { code: string; name: string; prob: number }
export interface SlotCandidate { code: string; name: string; prob: number }
export interface Matchup { home: string; away: string; homeName: string; awayName: string; prob: number }

export interface MatchInfo {
  match: number;
  round: string;
  group?: string;
  utc: string;
  venue: string;
  city: string;
  // resolved/known participants (codes) where defined, else null
  home: string | null;
  away: string | null;
  homeName: string | null;
  awayName: string | null;
  slotHome?: string;
  slotAway?: string;
  // projected candidates for undefined slots
  projHome?: SlotCandidate[];
  projAway?: SlotCandidate[];
  // most likely exact matchups (joint probability), knockout only
  topMatchups?: Matchup[];
  defined: boolean; // both participants known
  // live result
  status: "scheduled" | "final";
  homeScore?: number;
  awayScore?: number;
  // forecast for DEFINED matches only
  favorite?: { code: string; name: string; winProb: number };
  probs?: { home: number; draw: number; away: number };
  xg?: { home: number; away: number }; // model expected goals
  topScores?: { h: number; a: number; prob: number }[]; // most likely exact scorelines
}

export interface ThirdPlaceEntry {
  rank: number;
  group: string;
  code: string;
  name: string;
  pts: number;
  gd: number;
  gf: number;
  advancing: boolean; // currently among the best 8
  slot?: string; // winner-slot it is assigned to (e.g. "1A"), if advancing
  match?: number; // R32 match number
  facesGroup?: string; // the group whose winner it would face
}

export interface PredictionsPayload {
  updatedAt: string;
  iterations: number;
  matchesPlayed: number;
  totalGroupMatches: number;
  teams: TeamPrediction[];
  groups: GroupView[];
  r32Opponents: Record<string, OpponentProb[]>;
  matches: MatchInfo[];
  thirdPlaceRace: ThirdPlaceEntry[];
}

function topCandidates(dist: Record<string, number> | undefined, n = 4): SlotCandidate[] {
  if (!dist) return [];
  return Object.entries(dist)
    .map(([code, prob]) => ({ code, name: TEAM_BY_CODE[code]?.name ?? code, prob }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, n);
}

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

export async function computePredictions(iterations = 20000, seed = 20260611): Promise<PredictionsPayload> {
  const results = await fetchResults();
  const ratings = liveRatings(results);
  const preMatch = preMatchRatingsByPair(results); // ratings before each completed match, for honest pre-match reads
  const groupMatches = buildGroupMatches(results);
  const sim = runMonteCarlo(groupMatches, ratings, iterations, seed);

  const teams: TeamPrediction[] = Object.values(sim.teams)
    .map((t) => ({ ...t, name: TEAM_BY_CODE[t.code].name, rating: Math.round(ratings[t.code] ?? TEAM_BY_CODE[t.code].rating) }))
    .sort((a, b) => b.title - a.title);

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
        const p = sim.teams[r.code];
        const cl = clinch[r.code];
        // Mathematically eliminated: out of top-2 AND best-3rd path is impossible
        // (>=8 other groups guarantee a 3rd-placed team with more points than this team can reach).
        // Eliminated if it can never finish top-3 (always 4th -> can't even be a best-third),
        // or it's out of top-2 AND >=8 other groups guarantee a better third than it can reach.
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
        return {
          code: r.code, name: TEAM_BY_CODE[r.code].name, played: r.played, w: r.w, d: r.d, l: r.l,
          gf: r.gf, ga: r.ga, gd: r.gd, pts: r.pts, winGroup: p.winGroup, advance: p.advance, status,
          need: status === "live" ? nextMatchNeed(r.code, codes, groupMatches[g]) : undefined,
        };
      }),
    };
  });

  const r32Opponents: Record<string, OpponentProb[]> = {};
  for (const code in sim.r32Opponents) {
    r32Opponents[code] = Object.entries(sim.r32Opponents[code])
      .map(([opp, prob]) => ({ code: opp, name: TEAM_BY_CODE[opp]?.name ?? opp, prob }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 6);
  }

  // Knockout slots resolve to a definite team only when mathematically locked: a clinched group winner
  // fills its "1X" slot, a clinched runner-up its "2X" slot. (W## / 3rd slots stay projected — no over-claiming.)
  const lockedSlot: Record<string, string> = {};
  for (const gv of groups) {
    const w = gv.teams.find((t) => t.status === "won_group");
    if (w) lockedSlot["1" + gv.group] = w.code;
    const s = gv.teams.find((t) => t.status === "second");
    if (s) lockedSlot["2" + gv.group] = s.code;
  }

  // live results indexed by sorted team-pair (group matches)
  const resByPair = new Map<string, FetchedMatch>();
  for (const r of results) resByPair.set([r.homeCode, r.awayCode].sort().join("-"), r);

  const matches: MatchInfo[] = SCHEDULE.map((s) => {
    const info: MatchInfo = {
      match: s.match, round: s.round, group: s.group, utc: s.utc, venue: s.venue, city: s.city,
      home: null, away: null, homeName: null, awayName: null, defined: false, status: "scheduled",
    };
    if (s.round === "GROUP") {
      info.home = s.home!; info.away = s.away!;
      info.homeName = TEAM_BY_CODE[s.home!].name; info.awayName = TEAM_BY_CODE[s.away!].name;
      info.defined = true;
      const r = resByPair.get([s.home!, s.away!].sort().join("-"));
      if (r) {
        info.status = "final";
        const orient = r.homeCode === s.home;
        info.homeScore = orient ? r.homeGoals : r.awayGoals;
        info.awayScore = orient ? r.awayGoals : r.homeGoals;
      }
    } else {
      info.slotHome = s.homeSlot; info.slotAway = s.awaySlot;
      const proj = sim.matchProjection[s.match];
      info.projHome = topCandidates(proj?.home);
      info.projAway = topCandidates(proj?.away);
      const pairs = sim.matchPairs[s.match];
      if (pairs) {
        info.topMatchups = Object.entries(pairs)
          .map(([k, prob]) => {
            const [h, a] = k.split("|");
            return { home: h, away: a, homeName: TEAM_BY_CODE[h]?.name ?? h, awayName: TEAM_BY_CODE[a]?.name ?? a, prob };
          })
          .sort((x, y) => y.prob - x.prob)
          .slice(0, 4);
      }
      // A slot resolves to a definite team only when mathematically locked (clinched winner/runner-up).
      const rh = s.homeSlot ? lockedSlot[s.homeSlot] : undefined;
      const ra = s.awaySlot ? lockedSlot[s.awaySlot] : undefined;
      if (rh) { info.home = rh; info.homeName = TEAM_BY_CODE[rh].name; }
      if (ra) { info.away = ra; info.awayName = TEAM_BY_CODE[ra].name; }
      info.defined = Boolean(info.home && info.away);
    }
    // forecast for DEFINED matches. Includes the SAME host advantage the Monte Carlo applies (host
    // nation gets an Elo boost at home, larger at altitude), so the per-match W/D/L, xG and scorelines
    // shown on the detail page reconcile with the tournament odds. Kept for final matches too so the
    // detail page can show the model's pre-match read alongside the actual result.
    if (info.defined && info.home && info.away) {
      // For a completed match, read ratings as they stood BEFORE it (true pre-match view, no hindsight).
      const r = info.status === "final" ? (preMatch[[info.home, info.away].sort().join("-")] ?? ratings) : ratings;
      const diff =
        (r[info.home] ?? 1500) - (r[info.away] ?? 1500) +
        hostEloBoost(info.home, info.venue) - hostEloBoost(info.away, info.venue);
      const p = wdlProbs(diff);
      info.probs = { home: p.win, draw: p.draw, away: p.loss };
      const favCode = p.win >= p.loss ? info.home : info.away;
      info.favorite = { code: favCode, name: TEAM_BY_CODE[favCode].name, winProb: Math.max(p.win, p.loss) };
      const [lh, la] = eloToLambdas(diff);
      info.xg = { home: Math.round(lh * 10) / 10, away: Math.round(la * 10) / 10 };
      if (info.status !== "final") {
        info.topScores = scorelineDist(diff).slice(0, 6).map((s) => ({ h: s.h, a: s.a, prob: Math.round(s.prob * 1000) / 1000 }));
      }
    }
    return info;
  });

  // A team projected into the FINAL cannot also appear in the third-place play-off: both matches are fed by
  // the same two semifinals (winners -> final, losers -> 3rd place). Projected per slot, the modal "loser" of
  // a semifinal can be that semifinal's favourite itself (it reaches the game so often it's also the modal
  // loser), which would show e.g. Argentina in both the final and the 3rd-place match. Drop the projected
  // finalists from M103's loser-slot distributions so the third-place projection stays consistent.
  {
    const m103 = matches.find((m) => m.match === 103);
    const m104 = matches.find((m) => m.match === 104);
    if (m103 && m104) {
      const finalists = new Set(
        [m104.home, m104.away, m104.projHome?.[0]?.code, m104.projAway?.[0]?.code].filter(Boolean) as string[],
      );
      const drop = (list?: SlotCandidate[]) => (list ?? []).filter((c) => !finalists.has(c.code));
      m103.projHome = drop(m103.projHome);
      m103.projAway = drop(m103.projAway);
      m103.topMatchups = (m103.topMatchups ?? []).filter((mu) => !finalists.has(mu.home) && !finalists.has(mu.away));
    }
  }

  const matchesPlayed = results.filter((r) => r.group != null && r.date.slice(0, 10) <= "2026-06-27").length;

  // Third-place race: rank the 12 current 3rd-placed teams; top 8 advance; apply Annex C for slot assignment.
  const rankedThirds = rankThirds(thirdRows, ratings);
  const advancingGroups = new Set(rankedThirds.slice(0, 8).map((t) => t.group));
  const teamSlot: Record<string, string> = {};
  try {
    const { slotToTeam } = selectAndAssignThirds(thirdRows, ratings);
    for (const [slot, code] of Object.entries(slotToTeam)) teamSlot[code] = slot;
  } catch {
    /* needs >=8 distinct group thirds; always true with 12 groups */
  }
  const thirdHostMatch: Record<string, number> = {};
  for (const m of KNOCKOUT) {
    if (m.round !== "R32") continue;
    if (m.away.startsWith("3:")) thirdHostMatch[m.home] = m.match;
    else if (m.home.startsWith("3:")) thirdHostMatch[m.away] = m.match;
  }
  const thirdPlaceRace: ThirdPlaceEntry[] = rankedThirds.map((t, i) => {
    const code = t.row.code;
    const advancing = advancingGroups.has(t.group);
    const slot = advancing ? teamSlot[code] : undefined;
    return {
      rank: i + 1, group: t.group, code, name: TEAM_BY_CODE[code].name,
      pts: t.row.pts, gd: t.row.gd, gf: t.row.gf, advancing,
      slot, match: slot ? thirdHostMatch[slot] : undefined, facesGroup: slot ? slot[1] : undefined,
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    iterations,
    matchesPlayed,
    totalGroupMatches: 72,
    teams,
    groups,
    r32Opponents,
    matches,
    thirdPlaceRace,
  };
}
