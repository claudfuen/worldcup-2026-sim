// End-to-end: pull live results -> live ratings -> Monte Carlo -> assemble the payload stored in KV / rendered.
import { fetchResults, liveRatings, preMatchRatingsByPair, buildGroupMatches, GROUP_STAGE_END, type FetchedMatch, type LiveMatch } from "./espn";
import { runMonteCarlo } from "./sim/simulate";
import { rankThirds, selectAndAssignThirds, lockedThirdSlots, type ThirdTeam } from "./sim/thirdPlace";
import { resolveKnockoutResults, type GroupOutcome, type KOPlayed, type KOLive } from "./sim/knockout";
import { rankGroup } from "./sim/standings";
import { wdlProbs, eloToLambdas, scorelineDist, fracRemaining, koAdvanceProb } from "./sim/poisson";
import { hostEloBoost } from "./sim/hosts";
import { buildGroupViews, lockedSlotsFromGroups } from "./groupView";
import { getMatchSummary } from "./matchEvents";
import { overlayLive } from "./live";
import { computeAwards, type Awards } from "./awards";
import { getSquadPositions } from "./squads";
import { TEAM_BY_CODE, TEAMS, GROUPS } from "./data/teams";
import { SCHEDULE } from "./data/schedule";
import { KNOCKOUT } from "./data/bracket";
import type { TeamProb } from "./sim/simulate";

export interface TeamPrediction extends TeamProb {
  name: string;
  rating: number; // rounded, for display
  ratingExact: number; // full-precision live Elo — the FIFA-ranking tiebreak proxy; lets the render-time
  // finalization reproduce the cron's standings/third-place tiebreaks exactly (no rounding divergence)
  titleDelta?: number; // change in title odds since the start of today (ET)
}
export interface GroupTeamView {
  code: string; name: string; played: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number; winGroup: number; advance: number;
  // certainty flips from probability to a definitive state once locked
  status: "won_group" | "second" | "advanced" | "eliminated" | "live";
  need?: string; // plain-language 'what you need in your last match', when there's a clean answer
  advanceDelta?: number; // change in advance % since the start of today (ET)
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
  // live result / in-progress overlay
  status: "scheduled" | "live" | "final";
  homeScore?: number;
  awayScore?: number;
  winner?: string; // advancing team of a completed knockout match (set even when decided on penalties)
  // Penalty shootout tally (oriented home/away), set ONLY for a knockout tie decided on penalties. The
  // regulation+ET score stays in homeScore/awayScore (a level draw); these carry e.g. 4 / 3. Use the
  // helpers in lib/penalties.ts to read these consistently across the UI.
  homePens?: number;
  awayPens?: number;
  liveDetail?: string; // clock/state for in-progress matches, e.g. "45'+3'"
  liveMinute?: number; // parsed elapsed minute for an in-progress match (drives live win-probability)
  liveProbs?: { home: number; draw: number; away: number }; // CURRENT W/D/L given the live score + minute (render-time)
  // forecast for DEFINED matches only
  favorite?: { code: string; name: string; winProb: number };
  probs?: { home: number; draw: number; away: number };
  // Knockout only: P(each side ADVANCES) — regulation + extra time + penalty shootout, summing to 1. The
  // meaningful KO outcome (someone always goes through), distinct from the regulation W/D/L above.
  advance?: { home: number; away: number };
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
  advancing: boolean; // CURRENT-standings snapshot: among the best 8 right now (a race-order marker, NOT a forecast)
  advanceProb: number; // Monte Carlo P(this team reaches the Round of 32) — the calibrated forecast, not the snapshot
  status: GroupTeamView["status"]; // clinch state, so a mathematically locked/eliminated third shows ✓/out not a %
  slot?: string; // winner-slot it is assigned to (e.g. "1A"), if advancing (or its current projection)
  match?: number; // R32 match number
  facesGroup?: string; // the group whose winner it would face
  slotLocked?: boolean; // the bracket slot is mathematically fixed (same Annex C slot across every reachable qualifying set)
  opponent?: { code: string; name: string }; // the certain R32 opponent — set only when slot is locked AND that group's winner is clinched (i.e. the whole match is decided)
  city?: string; // host city of the R32 match (when a slot is known)
  opponents?: OpponentProb[]; // top-3 likely R32 opponents, probability conditional on this team advancing
  decided: boolean; // whether this team's group is fully played (so its 3rd-place line is final) — drives the survival math in the UI
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
  awards: Awards; // Golden Boot + assists race (current standings + forecast finish)
  complete: boolean; // every match played — the tournament is over (the signal end-state UI keys off)
  champion?: string; // code of the team that won the final, once it's been played
}

// Start-of-day odds snapshot, for "moved since yesterday" deltas.
export interface BaselineSnapshot {
  dateET: string; // ET calendar day this baseline represents
  title: Record<string, number>;
  advance: Record<string, number>;
}

export function snapshotOf(p: PredictionsPayload): Pick<BaselineSnapshot, "title" | "advance"> {
  const title: Record<string, number> = {};
  for (const t of p.teams) title[t.code] = t.title;
  const advance: Record<string, number> = {};
  for (const g of p.groups) for (const t of g.teams) advance[t.code] = t.advance;
  return { title, advance };
}

// Attach per-team deltas vs the baseline (in place). No-op if no baseline yet.
export function applyDeltas(p: PredictionsPayload, base: BaselineSnapshot | null): void {
  if (!base) return;
  for (const t of p.teams) {
    if (base.title[t.code] != null) t.titleDelta = t.title - base.title[t.code];
  }
  for (const g of p.groups) {
    for (const t of g.teams) {
      if (base.advance[t.code] != null) t.advanceDelta = t.advance - base.advance[t.code];
    }
  }
}

// Per-match pre-match read (W/D/L, favourite, xG, likely scorelines) for a DEFINED match — same host
// advantage as the Monte Carlo so the detail page reconciles with the tournament odds. Idempotent and a
// no-op until both teams are known; called both in the initial build AND again after a third-place slot
// resolves a participant later (otherwise that match — e.g. a clinched third-place R32 — would have no probs).
function fillMatchForecast(info: MatchInfo, ratings: Record<string, number>, preMatch: Record<string, Record<string, number>>): void {
  if (!info.defined || !info.home || !info.away) return;
  // For a completed match, read ratings as they stood BEFORE it (true pre-match view, no hindsight).
  const r = info.status === "final" ? (preMatch[[info.home, info.away].sort().join("-")] ?? ratings) : ratings;
  const diff =
    (r[info.home] ?? 1500) - (r[info.away] ?? 1500) +
    hostEloBoost(info.home, info.venue) - hostEloBoost(info.away, info.venue);
  const p = wdlProbs(diff);
  info.probs = { home: p.win, draw: p.draw, away: p.loss };
  const favCode = p.win >= p.loss ? info.home : info.away;
  info.favorite = { code: favCode, name: TEAM_BY_CODE[favCode].name, winProb: Math.max(p.win, p.loss) };
  // Knockout: who ADVANCES (regulation + ET + shootout). The draw above is the chance it goes the distance.
  if (info.round !== "GROUP") {
    const adv = koAdvanceProb(diff);
    info.advance = { home: adv, away: 1 - adv };
  }
  const [lh, la] = eloToLambdas(diff);
  info.xg = { home: Math.round(lh * 10) / 10, away: Math.round(la * 10) / 10 };
  if (info.status !== "final") {
    info.topScores = scorelineDist(diff).slice(0, 6).map((s) => ({ h: s.h, a: s.a, prob: Math.round(s.prob * 1000) / 1000 }));
  }
}

function topCandidates(dist: Record<string, number> | undefined, n = 4): SlotCandidate[] {
  if (!dist) return [];
  return Object.entries(dist)
    .map(([code, prob]) => ({ code, name: TEAM_BY_CODE[code]?.name ?? code, prob }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, n);
}

export async function computePredictions(iterations = 20000, seed = 20260611, live: LiveMatch[] = []): Promise<PredictionsPayload> {
  const results = await fetchResults();
  const ratings = liveRatings(results);
  const preMatch = preMatchRatingsByPair(results); // ratings before each completed match, for honest pre-match reads
  // Fold in-progress group matches into the simulation so every probability (group/advance/title and the
  // projected knockout bracket) re-routes off the live scoreline, not just the pre-match read.
  const groupMatches = buildGroupMatches(results, live);

  // Condition the knockout simulation on ACTUAL results once the bracket starts. Only resolvable when the
  // group stage is complete (the only time knockout matches exist): the R32 participants are then fixed, so
  // each completed knockout result maps cleanly to its match and fixes that match's winner in every sim
  // iteration (an eliminated team can no longer carry deep-run odds, and the real qualifier propagates).
  let koWinners: Record<number, string> = {};
  let koLosers: Record<number, string> = {};
  let koPlayed: Record<number, KOPlayed> = {};
  if (GROUPS.every((g) => groupMatches[g].every((m) => m.played))) {
    const groupOutcome: GroupOutcome = {};
    const thirds: ThirdTeam[] = [];
    for (const g of GROUPS) {
      const codes = TEAMS.filter((t) => t.group === g).map((t) => t.code);
      const ranked = rankGroup(codes, groupMatches[g], ratings);
      groupOutcome[g] = ranked.map((r) => r.code);
      thirds.push({ group: g, row: ranked[2] });
    }
    const koResults = results.filter((r) => r.date.slice(0, 10) > GROUP_STAGE_END);
    const resolved = resolveKnockoutResults(groupOutcome, selectAndAssignThirds(thirds, ratings).slotToTeam, koResults);
    koWinners = resolved.winners;
    koLosers = resolved.losers;
    koPlayed = resolved.played;
  }
  // Played-knockout feeders (W##/L##) resolve to their real qualifier for downstream slots.
  const koSlotTeam: Record<string, string> = {};
  for (const [mn, code] of Object.entries(koWinners)) koSlotTeam[`W${mn}`] = code;
  for (const [mn, code] of Object.entries(koLosers)) koSlotTeam[`L${mn}`] = code;

  // In-progress KNOCKOUT matches: condition advancement on the live score so it propagates downstream
  // (group-stage live matches are handled by buildGroupMatches above; KO matches are split off by date).
  const koLive: KOLive = {};
  for (const l of live) {
    if (l.state !== "in" || l.minute == null || l.date.slice(0, 10) <= GROUP_STAGE_END) continue;
    koLive[[l.homeCode, l.awayCode].sort().join("-")] = {
      homeCode: l.homeCode, homeScore: l.homeGoals, awayScore: l.awayGoals, frac: fracRemaining(l.minute), eloAdj: l.eloAdj,
    };
  }

  const sim = runMonteCarlo(groupMatches, ratings, iterations, seed, koWinners, koLive);

  const teams: TeamPrediction[] = Object.values(sim.teams)
    .map((t) => {
      const exact = ratings[t.code] ?? TEAM_BY_CODE[t.code].rating;
      return { ...t, name: TEAM_BY_CODE[t.code].name, rating: Math.round(exact), ratingExact: exact };
    })
    .sort((a, b) => b.title - a.title);

  // Group standings + definitive clinch states (shared with the render-time live finalization layer).
  const { groups, thirdRows } = buildGroupViews(groupMatches, ratings, (code) => {
    const p = sim.teams[code];
    return { winGroup: p.winGroup, advance: p.advance };
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
  const lockedSlot = lockedSlotsFromGroups(groups);

  // live results indexed by sorted team-pair (group matches)
  // Group-stage results only, keyed by team pair (used to fill the GROUP rows below). Filtered to the group
  // window for the same reason buildGroupMatches is: two same-group teams can meet again in a knockout
  // rematch (R16+/Final), and that later result must not overwrite the group fixture's displayed score.
  const resByPair = new Map<string, FetchedMatch>();
  for (const r of results) {
    if (r.group == null || r.date.slice(0, 10) > GROUP_STAGE_END) continue;
    resByPair.set([r.homeCode, r.awayCode].sort().join("-"), r);
  }

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
      const pl = koPlayed[s.match];
      if (pl) {
        // Actually played: real participants, score, and advancing team (incl. penalty wins).
        info.home = pl.home; info.away = pl.away;
        info.homeName = TEAM_BY_CODE[pl.home].name; info.awayName = TEAM_BY_CODE[pl.away].name;
        info.homeScore = pl.homeScore; info.awayScore = pl.awayScore;
        info.winner = pl.winner;
        if (pl.homePens != null && pl.awayPens != null) { info.homePens = pl.homePens; info.awayPens = pl.awayPens; }
        info.status = "final";
      } else {
        // A slot resolves to a definite team when mathematically locked (clinched winner/runner-up) or when
        // a played knockout feeder (W##/L##) has produced its real qualifier.
        const rh = s.homeSlot ? (lockedSlot[s.homeSlot] ?? koSlotTeam[s.homeSlot]) : undefined;
        const ra = s.awaySlot ? (lockedSlot[s.awaySlot] ?? koSlotTeam[s.awaySlot]) : undefined;
        if (rh) { info.home = rh; info.homeName = TEAM_BY_CODE[rh].name; }
        if (ra) { info.away = ra; info.awayName = TEAM_BY_CODE[ra].name; }
      }
      info.defined = Boolean(info.home && info.away);
    }
    // forecast for DEFINED matches. Includes the SAME host advantage the Monte Carlo applies (host
    // nation gets an Elo boost at home, larger at altitude), so the per-match W/D/L, xG and scorelines
    // shown on the detail page reconcile with the tournament odds. Kept for final matches too so the
    // detail page can show the model's pre-match read alongside the actual result.
    fillMatchForecast(info, ratings, preMatch);
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
      // Filter each side INDEPENDENTLY: M103's home slot (SF1 loser) and M104's home slot (SF1 winner) are
      // the same semifinal, so the projected final-home team can't also be the 3rd-place home team - but it
      // CAN legitimately appear in M103's away slot (the other semifinal). A blanket finalist set wrongly
      // dropped such cross-side candidates.
      const homeFinalists = new Set([m104.home, m104.projHome?.[0]?.code].filter(Boolean) as string[]);
      const awayFinalists = new Set([m104.away, m104.projAway?.[0]?.code].filter(Boolean) as string[]);
      m103.projHome = (m103.projHome ?? []).filter((c) => !homeFinalists.has(c.code));
      m103.projAway = (m103.projAway ?? []).filter((c) => !awayFinalists.has(c.code));
      m103.topMatchups = (m103.topMatchups ?? []).filter((mu) => !homeFinalists.has(mu.home) && !awayFinalists.has(mu.away));
    }
  }

  const matchesPlayed = results.filter((r) => r.group != null && r.date.slice(0, 10) <= GROUP_STAGE_END).length;

  // Third-place race: rank the 12 current 3rd-placed teams; top 8 advance; apply Annex C for slot assignment.
  const rankedThirds = rankThirds(thirdRows, ratings);
  const advancingGroups = new Set(rankedThirds.slice(0, 8).map((t) => t.group));
  const teamSlot: Record<string, string> = {};
  let slotToTeamMap: Record<string, string> = {};
  try {
    const { slotToTeam } = selectAndAssignThirds(thirdRows, ratings);
    slotToTeamMap = slotToTeam;
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
  const statusByCode: Record<string, GroupTeamView["status"]> = {};
  for (const g of groups) for (const tm of g.teams) statusByCode[tm.code] = tm.status;
  // A third whose group is guaranteed to advance can have a LOCKED bracket slot (the Annex C slot is the
  // same across every still-reachable qualifying set); if the group winner that slot faces is also clinched,
  // the whole R32 match is decided. lockedThirdSlots scans the Annex C table for that invariance.
  const guaranteedThirdGroups = groups.filter((g) => g.teams[2]?.status === "advanced").map((g) => g.group);
  const eliminatedThirdGroups = groups.filter((g) => g.teams[2]?.status === "eliminated").map((g) => g.group);
  const lockedThird = lockedThirdSlots(guaranteedThirdGroups, eliminatedThirdGroups);
  // host winner-slot -> the team whose 3rd is locked into it (so the bracket can resolve a settled third
  // slot to an exact team even before the whole group stage finishes). The group is decided (it's a
  // "guaranteed advanced" third), so teams[2] is its final 3rd-placed team.
  const lockedThirdTeamBySlot: Record<string, string> = {};
  for (const [g, slot] of Object.entries(lockedThird)) {
    const gv = groups.find((x) => x.group === g);
    if (gv?.decided && gv.teams[2]) lockedThirdTeamBySlot[slot] = gv.teams[2].code;
  }
  const winnerByGroup: Record<string, string> = {};
  for (const g of groups) { const w = g.teams.find((t) => t.status === "won_group"); if (w) winnerByGroup[g.group] = w.code; }
  const groupDecided = new Map(groups.map((gg) => [gg.group, gg.decided]));
  const cityByMatch = new Map(matches.map((m) => [m.match, m.city]));
  const thirdPlaceRace: ThirdPlaceEntry[] = rankedThirds.map((t, i) => {
    const code = t.row.code;
    const advancing = advancingGroups.has(t.group);
    const lockedSlotFor = lockedThird[t.group]; // present => slot is mathematically fixed
    const slot = lockedSlotFor ?? (advancing ? teamSlot[code] : undefined);
    const match = slot ? thirdHostMatch[slot] : undefined;
    const oppGroup = slot ? slot[1] : undefined;
    const oppCode = lockedSlotFor && oppGroup ? winnerByGroup[oppGroup] : undefined; // certain only if winner clinched
    const advProb = sim.teams[code].advance;
    const opp = (r32Opponents[code] ?? [])
      .slice(0, 3)
      .map((o) => ({ ...o, prob: advProb > 0 ? Math.min(o.prob / advProb, 1) : o.prob })); // conditional on advancing
    return {
      rank: i + 1, group: t.group, code, name: TEAM_BY_CODE[code].name,
      pts: t.row.pts, gd: t.row.gd, gf: t.row.gf, advancing,
      advanceProb: advProb, status: statusByCode[code] ?? "live",
      slot, match, facesGroup: oppGroup,
      slotLocked: lockedSlotFor ? true : undefined,
      opponent: oppCode ? { code: oppCode, name: TEAM_BY_CODE[oppCode].name } : undefined,
      city: match ? cityByMatch.get(match) : undefined,
      opponents: opp.length ? opp : undefined,
      decided: groupDecided.get(t.group) ?? false,
    };
  });

  // Third-place R32 slots carry the Monte Carlo forecast in projHome/projAway (the full Annex C assignment is
  // modelled in EVERY iteration, so this distribution is rule-correct and sharpens as groups finalize). We
  // resolve a third-place slot to its EXACT team as soon as it's mathematically settled — either the whole
  // group stage is complete (the full Annex C assignment is final) OR that individual slot is locked
  // (lockedThirdTeamBySlot: the group→slot mapping can't change across any reachable qualifying set).
  const groupStageComplete = groups.every((g) => g.decided);
  const resolvedThirdBySlot = groupStageComplete ? slotToTeamMap : lockedThirdTeamBySlot;
  for (const mi of matches) {
    if (mi.round !== "R32" || mi.status === "final") continue; // a played R32 already has its real teams
    const thirdSide = mi.slotHome?.startsWith("3:") ? "home" : mi.slotAway?.startsWith("3:") ? "away" : null;
    if (!thirdSide) continue;
    const hostSlot = thirdSide === "home" ? mi.slotAway : mi.slotHome; // winner-slot facing the third, e.g. "1D"
    const code = hostSlot ? resolvedThirdBySlot[hostSlot] : undefined;
    if (!code) continue;
    if (thirdSide === "home") { if (!mi.home) { mi.home = code; mi.homeName = TEAM_BY_CODE[code].name; } }
    else if (!mi.away) { mi.away = code; mi.awayName = TEAM_BY_CODE[code].name; }
    mi.defined = Boolean(mi.home && mi.away);
    // This slot resolved AFTER the forecast pass above — so a now-defined match (e.g. a clinched third-place
    // R32 like Mexico v Ecuador) would otherwise have no pre-match W/D/L. Fill it in now.
    if (mi.defined && !mi.probs) fillMatchForecast(mi, ratings, preMatch);
  }

  // Golden Boot + assists race, aggregated from the parsed match timelines and projected forward over each
  // team's expected remaining matches. Best-effort: a feed hiccup leaves the awards empty, never breaks the
  // rest of the payload. The stored `matches` only carry "final" status (live status is a render-time overlay),
  // so overlay the live feed here first — otherwise an in-progress match counts as "scheduled" and its goals
  // (e.g. a hat-trick mid-match) are excluded from the live Golden Boot until full-time.
  const squadPositions = await getSquadPositions().catch(() => ({}));
  const awards = await computeAwards(overlayLive(matches, live), sim.teams, getMatchSummary, squadPositions).catch(
    () => ({ goldenBoot: [], assists: [], players: [], matchesCounted: 0 }) as Awards,
  );

  // Tournament-over signal + the realized champion (the final's winner) — drives every end-state in the UI.
  const complete = matches.length > 0 && matches.every((mi) => mi.status === "final");
  const champion = matches.find((mi) => mi.round === "FINAL")?.winner;

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
    awards,
    complete,
    champion,
  };
}
