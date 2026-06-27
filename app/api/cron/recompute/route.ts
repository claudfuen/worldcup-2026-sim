import { NextResponse } from "next/server";
import { computePredictions, snapshotOf, applyDeltas, type BaselineSnapshot } from "@/lib/predictions";
import { fetchLive } from "@/lib/espn";
import { liveSignature, withLiveAdjustments } from "@/lib/live";
import { kvSetJSON, kvGetJSON, PRED_KEY, BASELINE_KEY, LIVE_SIG_KEY } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Final is 2026-07-19; stop recomputing a couple of days after, so we don't poll ESPN forever once the
// tournament is over. The last computed payload stays frozen in KV (pages keep serving the final state).
const STOP_RECOMPUTE_AFTER = "2026-07-21"; // UTC date (YYYY-MM-DD)

// When nothing is live, recompute at least this often anyway: rolls the daily delta baseline and absorbs a
// match that finished between ticks. During a match the live signature changes every minute, so this floor
// is irrelevant — the cron tracks the action.
const HEARTBEAT_MS = 8 * 60 * 1000;

// Vercel Cron hits this every minute (see vercel.json). It pulls live ESPN results, rebuilds ratings, and
// runs the Monte Carlo (conditioned on live in-progress matches), storing the payload in KV. A live-state
// signature gate skips the heavy run when nothing has changed, so the per-minute schedule is cheap off-peak
// and near-real-time during a match.
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

  // Live state (fresh, authoritative): drives both the signature gate and the Monte Carlo conditioning.
  const live = await fetchLive().catch(() => []);
  const sig = liveSignature(live);
  const prevSig = await kvGetJSON<{ sig: string; at: number }>(LIVE_SIG_KEY).catch(() => null);
  const forced = new URL(req.url).searchParams.get("force") === "1";
  const stale = !prevSig || Date.now() - prevSig.at > HEARTBEAT_MS;
  if (!forced && prevSig && prevSig.sig === sig && !stale) {
    // Nothing moved since the last tick and the heartbeat hasn't elapsed — skip the heavy recompute.
    return NextResponse.json({ ok: true, skipped: "no live change", live: live.length });
  }

  const t0 = Date.now();
  // Enrich live matches with their in-game Elo nudge (red cards / shot dominance) before simulating, so
  // those factors flow into every probability — not just the per-match widget. Only runs when recomputing.
  const enriched = await withLiveAdjustments(live).catch(() => live);
  const payload = await computePredictions(20000, undefined, enriched);

  // Odds-movement deltas: how the odds have moved since the start of the ET day. The baseline rolls
  // once per ET day, anchored to THIS cron's freshly-computed payload at the first tick of the day.
  // (The MC is deterministic - fixed seed - and no matches play overnight, so this first-tick state is
  // identical to yesterday's last; anchoring to `payload` instead of re-reading PRED_KEY makes the
  // baseline immune to a mid-day KV eviction or cold-start reseed of PRED_KEY.)
  const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  let baseline = await kvGetJSON<BaselineSnapshot>(BASELINE_KEY).catch(() => null);
  if (!baseline || baseline.dateET !== todayET) {
    baseline = { dateET: todayET, ...snapshotOf(payload) };
    await kvSetJSON(BASELINE_KEY, baseline).catch(() => {});
  }
  applyDeltas(payload, baseline);

  await kvSetJSON(PRED_KEY, payload);
  await kvSetJSON(LIVE_SIG_KEY, { sig, at: Date.now() }).catch(() => {});
  return NextResponse.json({
    ok: true,
    updatedAt: payload.updatedAt,
    matchesPlayed: payload.matchesPlayed,
    iterations: payload.iterations,
    live: live.length,
    tookMs: Date.now() - t0,
  });
}
