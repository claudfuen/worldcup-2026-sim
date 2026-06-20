import { NextResponse } from "next/server";
import { computePredictions } from "@/lib/predictions";
import { kvSetJSON, PRED_KEY } from "@/lib/kv";

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
  await kvSetJSON(PRED_KEY, payload);
  return NextResponse.json({
    ok: true,
    updatedAt: payload.updatedAt,
    matchesPlayed: payload.matchesPlayed,
    iterations: payload.iterations,
    tookMs: Date.now() - t0,
  });
}
