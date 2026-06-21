import { NextResponse } from "next/server";
import { computePredictions, snapshotOf, applyDeltas, type BaselineSnapshot, type PredictionsPayload } from "@/lib/predictions";
import { kvSetJSON, kvGetJSON, PRED_KEY, BASELINE_KEY } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel Cron hits this every 30 min. It pulls live ESPN results, rebuilds ratings,
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
