// Merge the i18n-extract workflow's per-cluster fragments into lib/i18n/messages/en.json, and inject
// the `teams` namespace (48 English display names) as the source for team-name localization.
//
// Usage:
//   1. write the workflow's returned fragments to scripts/_i18n-fragments.json  (an array of objects,
//      each either {messages:{...}} or a bare namespace object)
//   2. bun run scripts/i18n-merge.ts
//
// Idempotent-ish: re-running re-merges fragments over the current en.json (fragments win on leaf keys,
// EXCEPT we never clobber an existing non-empty string with an empty one).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TEAMS } from "../lib/data/teams";

const ROOT = join(import.meta.dir, "..");
const EN_PATH = join(ROOT, "lib/i18n/messages/en.json");
const FRAG_PATH = join(ROOT, "scripts/_i18n-fragments.json");

type Json = { [k: string]: unknown };

function isObj(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(target: Json, src: Json): Json {
  for (const [k, v] of Object.entries(src)) {
    if (isObj(v) && isObj(target[k])) {
      target[k] = deepMerge(target[k] as Json, v);
    } else if (isObj(v)) {
      target[k] = deepMerge({}, v);
    } else if (v === "" && typeof target[k] === "string" && target[k] !== "") {
      // don't overwrite a real string with an empty one
    } else {
      target[k] = v;
    }
  }
  return target;
}

const en: Json = JSON.parse(readFileSync(EN_PATH, "utf8"));

let fragCount = 0;
if (existsSync(FRAG_PATH)) {
  const raw = JSON.parse(readFileSync(FRAG_PATH, "utf8"));
  const frags: unknown[] = Array.isArray(raw) ? raw : [raw];
  for (const f of frags) {
    const messages = isObj(f) && isObj((f as Json).messages) ? ((f as Json).messages as Json) : (f as Json);
    if (isObj(messages)) {
      deepMerge(en, messages);
      fragCount++;
    }
  }
} else {
  console.warn(`(no ${FRAG_PATH} — merging team names + shared keys only)`);
}

// teams namespace: code -> English display name (the canonical source for per-locale name translation).
const teams: Json = isObj(en.teams) ? (en.teams as Json) : {};
for (const t of TEAMS) if (!teams[t.code]) teams[t.code] = t.name;
en.teams = teams;

// ensure shared keys the switcher/footer need
const footer: Json = isObj(en.footer) ? (en.footer as Json) : {};
if (!footer.switchLanguage) footer.switchLanguage = "Switch language";
en.footer = footer;

writeFileSync(EN_PATH, JSON.stringify(en, null, 2) + "\n");

function countLeaves(o: Json): number {
  let n = 0;
  for (const v of Object.values(o)) n += isObj(v) ? countLeaves(v as Json) : 1;
  return n;
}
console.log(`Merged ${fragCount} fragment(s). en.json now has ${countLeaves(en)} strings across ${Object.keys(en).length} namespaces: ${Object.keys(en).sort().join(", ")}`);
