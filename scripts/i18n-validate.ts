// Validate every locale catalog against en.json: JSON validity, key parity (no missing/extra), and
// simple-placeholder preservation. Run after translation. Exit non-zero on any hard failure.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "../lib/i18n/messages");
const en = JSON.parse(readFileSync(join(DIR, "en.json"), "utf8"));

// locale ids to check (mirror config order, minus en)
const LOCALES = ["es", "pt", "fr", "de", "it", "ru", "ar", "hi", "id", "ja", "ko", "zh"];

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => !!v && typeof v === "object" && !Array.isArray(v);

function leaves(o: J, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isObj(v)) Object.assign(out, leaves(v as J, key));
    else out[key] = String(v);
  }
  return out;
}

// simple runtime vars only: {name}, {count} — NOT ICU plural blocks {count, plural, …} or branch words.
function simpleVars(s: string): Set<string> {
  const set = new Set<string>();
  for (const m of s.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)) set.add(m[1]);
  return set;
}

const enLeaves = leaves(en);
const enKeys = new Set(Object.keys(enLeaves));
let hardFail = 0;

for (const loc of LOCALES) {
  const path = join(DIR, `${loc}.json`);
  if (!existsSync(path)) {
    console.log(`❌ ${loc}: FILE MISSING`);
    hardFail++;
    continue;
  }
  let data: J;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.log(`❌ ${loc}: INVALID JSON — ${(e as Error).message}`);
    hardFail++;
    continue;
  }
  const lv = leaves(data);
  const lk = new Set(Object.keys(lv));
  const missing = [...enKeys].filter((k) => !lk.has(k));
  const extra = [...lk].filter((k) => !enKeys.has(k));
  // placeholder drift: simple vars present in en but dropped in the translation
  const phDrift: string[] = [];
  for (const k of enKeys) {
    if (!lk.has(k)) continue;
    const a = simpleVars(enLeaves[k]);
    const b = simpleVars(lv[k]);
    const dropped = [...a].filter((v) => !b.has(v));
    if (dropped.length) phDrift.push(`${k} (dropped ${dropped.join(",")})`);
  }
  const status = missing.length || extra.length ? "❌" : phDrift.length ? "⚠️ " : "✅";
  if (missing.length || extra.length) hardFail++;
  console.log(
    `${status} ${loc}: ${lk.size} keys` +
      (missing.length ? ` | MISSING ${missing.length}: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}` : "") +
      (extra.length ? ` | EXTRA ${extra.length}: ${extra.slice(0, 6).join(", ")}${extra.length > 6 ? "…" : ""}` : "") +
      (phDrift.length ? ` | placeholder drift ${phDrift.length}: ${phDrift.slice(0, 4).join("; ")}${phDrift.length > 4 ? "…" : ""}` : ""),
  );
}

console.log(`\nen.json: ${enKeys.size} keys. ${hardFail ? `${hardFail} HARD FAILURE(S)` : "All locales structurally valid."}`);
process.exit(hardFail ? 1 : 0);
