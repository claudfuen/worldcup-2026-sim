import { TEAMS, GROUPS } from "@/lib/data/teams";
import { VENUES } from "@/lib/data/venues";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// Levenshtein-1 OR one adjacent transposition (Damerau distance ≤1), early-exit.
function dl1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let d = -1; // first mismatch
    for (let k = 0; k < la; k++) if (a[k] !== b[k]) { d = k; break; }
    if (d === -1) return true;
    // substitution: rest equal
    if (a.slice(d + 1) === b.slice(d + 1)) return true;
    // transposition: swap a[d],a[d+1]
    if (d + 1 < la && a[d] === b[d + 1] && a[d + 1] === b[d] && a.slice(d + 2) === b.slice(d + 2)) return true;
    return false;
  }
  // length diff 1: one insertion/deletion
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0, j = 0, skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; }
    else { if (skipped) return false; skipped = true; j++; }
  }
  return true;
}
interface Entry { label: string; type: string; words: string[]; keywords: string }
function entry(label: string, type: string, extra = ""): Entry { const keywords = norm(`${label} ${extra}`); return { label, type, keywords, words: keywords.split(/[^a-z0-9]+/).filter(Boolean) }; }
async function buildIndex(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const p of ["Overview","Groups","Bracket","Schedule","Stadiums","Awards","Scorecard","Method"]) out.push(entry(p, "page"));
  for (const t of TEAMS) out.push(entry(t.name, "team", `${t.code} group ${t.group}`));
  for (const g of GROUPS) out.push(entry(`Group ${g}`, "group", g));
  for (const v of VENUES) out.push(entry(v.fifaName, "venue", `${v.key} ${v.city} ${v.country}`));
  const players = await fetch("http://localhost:3191/api/search-index").then((r)=>r.json()).then((d)=>d.players ?? []);
  for (const pl of players) out.push(entry(pl.name, "player", pl.team));
  return out;
}
function match(idx: Entry[], query: string, minTok: number) {
  const q = norm(query);
  return idx.filter((e)=> e.keywords.includes(q) || (q.length>=minTok && e.words.some((w)=>w.length>=3 && dl1(q,w)))).map((e)=>e.label);
}
const TESTS: [string,string][] = [["messy","Messi"],["mesi","Messi"],["haalnd","Haaland"],["halaand","Haaland"],["mbape","Mbappé"],["argentna","Argentina"],["argentena","Argentina"],["argntina","Argentina"],["span","Spain"],["spian","Spain"],["brasil","Brazil"],["germny","Germany"],["portgal","Portugal"],["dalas","Dallas"],["braket","Bracket"],["bracet","Bracket"],["shedule","Schedule"]];
const idx = await buildIndex();
let found=0, miss=0, noise=0, noisy=0;
const det:string[]=[];
for (const [q,want] of TESTS){ const res=match(idx,q,4); const hit=res.some((l)=>norm(l).includes(norm(want))); if(hit)found++;else{miss++;} const ns=res.filter((l)=>!norm(l).includes(norm(want))&&!norm(want).includes(norm(l))); noise+=ns.length; if(ns.length)noisy++; if(!hit||ns.length){det.push(`  ${q.padEnd(11)} want=${want.padEnd(11)} ${hit?"OK ":"MISS"} noise=${ns.length}${ns.length?" ["+ns.slice(0,4).join(", ")+"]":""}`);} }
console.log(`Damerau-1 (minTok=4): found ${found}/${TESTS.length} · missed ${miss} · noise ${noise} · noisy queries ${noisy}`);
for(const d of det)console.log(d);
