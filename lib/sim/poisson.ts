// Scoreline model: map an Elo rating gap to two Poisson goal rates, then sample/score.
// Backtested params (sup_div, totalGoals) reproduce the direct-Elo W/D/L accuracy while ALSO yielding scorelines
// needed for goal-difference tiebreakers. Dixon-Coles low-score correction kept small (best-fit rho was ~0).
import { samplePoisson } from "./rng";

export const POISSON_CONFIG = { supDiv: 220, totalGoals: 2.6, rho: 0.05 };

// Returns [lambdaHome, lambdaAway] expected goals from the (home-perspective) rating gap.
export function eloToLambdas(
  ratingDiff: number,
  cfg: { supDiv?: number; totalGoals?: number } = {},
): [number, number] {
  const supDiv = cfg.supDiv ?? POISSON_CONFIG.supDiv;
  const total = cfg.totalGoals ?? POISSON_CONFIG.totalGoals;
  const sup = ratingDiff / supDiv;
  return [Math.max((total + sup) / 2, 0.05), Math.max((total - sup) / 2, 0.05)];
}

export function poissonPmf(lambda: number, k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / f;
}

// Win/Draw/Loss probabilities from two Poisson goal rates, with Dixon-Coles low-score correction.
export function wdlFromLambdas(lh: number, la: number, rho = POISSON_CONFIG.rho, maxG = 10): { win: number; draw: number; loss: number } {
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      let p = poissonPmf(lh, i) * poissonPmf(la, j);
      if (i <= 1 && j <= 1) p *= dcTau(i, j, lh, la, rho);
      if (i > j) win += p;
      else if (i === j) draw += p;
      else loss += p;
    }
  }
  const s = win + draw + loss;
  return { win: win / s, draw: draw / s, loss: loss / s };
}

// Win/Draw/Loss probabilities (home perspective) from the rating gap.
export function wdlProbs(
  ratingDiff: number,
  cfg: { supDiv?: number; totalGoals?: number; rho?: number; maxGoals?: number } = {},
): { win: number; draw: number; loss: number } {
  const [lh, la] = eloToLambdas(ratingDiff, cfg);
  return wdlFromLambdas(lh, la, cfg.rho ?? POISSON_CONFIG.rho, cfg.maxGoals ?? 10);
}

// Probability the home/first side ADVANCES in a knockout: regulation, then ~1/3-length extra time,
// then a coin-flip shootout on the remaining tie mass. Removes the favorite over-statement of bare Elo We.
function koAdvanceRaw(ratingDiff: number, cfg: { supDiv?: number; totalGoals?: number; rho?: number }): number {
  const [lh, la] = eloToLambdas(ratingDiff, cfg);
  const rho = cfg.rho ?? POISSON_CONFIG.rho;
  const reg = wdlFromLambdas(lh, la, rho, 8);
  const et = wdlFromLambdas(lh * 0.33, la * 0.33, rho, 8); // extra time ~ 1/3 of a match
  return reg.win + reg.draw * (et.win + et.draw * 0.5);
}
// Memoized on the default config (smooth in ratingDiff; bucket to 4 Elo for a large Monte Carlo speedup).
const koCache = new Map<number, number>();
export function koAdvanceProb(ratingDiff: number, cfg: { supDiv?: number; totalGoals?: number; rho?: number } = {}): number {
  if (cfg.supDiv == null && cfg.totalGoals == null && cfg.rho == null) {
    const key = Math.round(ratingDiff / 4);
    let v = koCache.get(key);
    if (v === undefined) { v = koAdvanceRaw(key * 4, cfg); koCache.set(key, v); }
    return v;
  }
  return koAdvanceRaw(ratingDiff, cfg);
}

function dcTau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

// Sample a regulation scoreline for the Monte Carlo (independent Poisson; DC correction is negligible at rho~0.05).
export function sampleScoreline(ratingDiff: number, rand: () => number, cfg = {}): [number, number] {
  const [lh, la] = eloToLambdas(ratingDiff, cfg);
  return [samplePoisson(lh, rand), samplePoisson(la, rand)];
}
