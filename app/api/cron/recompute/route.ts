import { NextResponse } from "next/server";
import { computePredictions, snapshotOf, applyDeltas, type BaselineSnapshot, type PredictionsPayload } from "@/lib/predictions";
import { kvSetJSON, kvGetJSON, PRED_KEY, BASELINE_KEY } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Final is 2026-07-19; stop recomputing a couple of days after, so we don't poll ESPN forever once the
// tournament is over. The last computed payload stays frozen in KV (pages keep serving the final state).
const STOP_RECOMPUTE_AFTER = "2026-07-21"; // UTC date (YYYY-MM-DD)

// Vercel Cron hits this frequently (see vercel.json). It pulls live ESPN results, rebuilds ratings,
// runs the Monte Carlo, and stores the payload in KV.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. `?secret=` is a manual-trigger fallback.
    const auth = req.headers.get("authorization");
    const qp = new URL(req.url).searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && qp !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  // Natural stopping point: once the World Cup is over, no-op (data is final, no reason to keep updating).
  if (new Date().toISOString().slice(0, 10) > STOP_RECOMPUTE_AFTER) {
    return NextResponse.json({ ok: true, skipped: "tournament complete; predictions frozen" });
  }
  const t0 = Date.now();
  const payload = await computePredictions(20000);

  // Odds-movement deltas: compare to the start of today (ET) = yesterday's last computed state.
  // The baseline rolls once per ET day, capturing the previous day's final odds.
  const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  let baseline = await kvGetJSON<BaselineSnapshot>(BASELINE_KEY).catch(() => null);
  if (!baseline || baseline.dateET !== todayET) {
    const prev = await kvGetJSON<PredictionsPayload>(PRED_KEY).catch(() => null);
    baseline = { dateET: todayET, ...snapshotOf(prev ?? payload) };
    await kvSetJSON(BASELINE_KEY, baseline).catch(() => {});
  }
  applyDeltas(payload, baseline);

  await kvSetJSON(PRED_KEY, payload);
  return NextResponse.json({
    ok: true,
    updatedAt: payload.updatedAt,
    matchesPlayed: payload.matchesPlayed,
    iterations: payload.iterations,
    tookMs: Date.now() - t0,
  });
}
