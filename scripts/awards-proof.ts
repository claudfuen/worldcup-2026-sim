// One-off: compute the real Golden Boot + assists race (current + forecast) from live data, to sanity-check
// the model before building UI.  Run: bun run scripts/awards-proof.ts
import { getPredictions } from "../lib/getPredictions";
import { getMatchSummary } from "../lib/matchEvents";
import { computeAwards } from "../lib/awards";
import type { TeamProb } from "../lib/sim/simulate";

const p = await getPredictions();
const teamsRec: Record<string, TeamProb> = Object.fromEntries(p.teams.map((t) => [t.code, t]));
const t0 = performance.now();
const awards = await computeAwards(p.matches, teamsRec, getMatchSummary);
console.log(`computeAwards: ${(performance.now() - t0).toFixed(0)}ms · aggregated ${awards.matchesCounted} matches`);

const expRem = (code: string) => {
  const t = teamsRec[code];
  return t ? (t.advance + t.r16 + t.qf + 2 * t.sf).toFixed(1) : "?";
};

console.log("\n=== GOLDEN BOOT — now → projected final, P(win) ===");
console.log("  G  A  player                  team   proj  win%   (mp, koMatchesLeft)");
for (const e of awards.goldenBoot.slice(0, 15)) {
  console.log(
    `  ${String(e.goals).padStart(2)} ${String(e.assists).padStart(2)}  ${e.player.padEnd(22)} ${e.teamCode.padEnd(4)}  ${e.projected.toFixed(1).padStart(4)}  ${(e.winProb * 100).toFixed(1).padStart(5)}%  (${e.matches}mp, +${expRem(e.teamCode)}ko)${e.penalties ? ` ${e.penalties}pk` : ""}`,
  );
}

console.log("\n=== ASSISTS — now → projected final, P(win) ===");
console.log("  A  G  player                  team   proj  win%");
for (const e of awards.assists.slice(0, 10)) {
  console.log(
    `  ${String(e.assists).padStart(2)} ${String(e.goals).padStart(2)}  ${e.player.padEnd(22)} ${e.teamCode.padEnd(4)}  ${e.projected.toFixed(1).padStart(4)}  ${(e.winProb * 100).toFixed(1).padStart(5)}%`,
  );
}

const totalWin = awards.goldenBoot.reduce((s, e) => s + e.winProb, 0);
console.log(`\nsanity: Σ goldenBoot winProb = ${(totalWin * 100).toFixed(0)}% (should ≈100), candidates=${awards.goldenBoot.length}`);
