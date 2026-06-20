import { runMonteCarlo, roundRobin } from "../lib/sim/simulate";
import { TEAMS, GROUPS } from "../lib/data/teams";
const ratings = Object.fromEntries(TEAMS.map(t => [t.code, t.rating]));
const gm: Record<string, ReturnType<typeof roundRobin>> = {};
for (const g of GROUPS) gm[g] = roundRobin(g, TEAMS.filter(t => t.group===g).map(t=>t.code));
for (const N of [10000, 20000, 50000]) {
  const t0 = performance.now();
  const r = runMonteCarlo(gm, ratings, N, 1);
  const ms = performance.now() - t0;
  const top = Object.values(r.teams).sort((a,b)=>b.title-a.title).slice(0,6);
  console.log(`N=${N}: ${ms.toFixed(0)}ms (${(ms/N*1000).toFixed(1)}us/iter)  title%: ${top.map(t=>`${t.code} ${(t.title*100).toFixed(1)}`).join(", ")}`);
}
