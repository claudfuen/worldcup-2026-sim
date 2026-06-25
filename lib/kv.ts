// Minimal Upstash Redis REST client (Vercel KV). Uses the REST command endpoint.
const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

async function cmd(args: (string | number)[]): Promise<unknown> {
  if (!URL || !TOKEN) throw new Error("KV env not configured (KV_REST_API_URL / KV_REST_API_TOKEN)");
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`KV ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { result?: unknown };
  return j.result;
}

export async function kvSetJSON(key: string, value: unknown): Promise<void> {
  await cmd(["SET", key, JSON.stringify(value)]);
}

export async function kvGetJSON<T>(key: string): Promise<T | null> {
  const r = await cmd(["GET", key]);
  if (r == null) return null;
  return JSON.parse(r as string) as T;
}

export const KV_CONFIGURED = Boolean(URL && TOKEN);

// Bump when the payload shape changes so stale cached data is ignored.
// v4: removed per-user `myMatches` from the shared payload (now stored per-user in Postgres).
// v5: clinch now resolves fully-decided groups via settled GD/GF — drop payloads cached with the old
//     (over-conservative) clinch so completed groups show definitive states immediately, not on next cron.
export const PRED_KEY = "predictions:v5";

// Start-of-day snapshot of title/advance odds, for "moved since yesterday" deltas. Rolled once per ET day.
export const BASELINE_KEY = "predictions:baseline:v1";
