import { NextResponse } from "next/server";
import { computePredictions } from "@/lib/predictions";
import { kvSetJSON } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Vercel Cron hits this every 30 min. It pulls live ESPN results, rebuilds ratings,
// runs the Monte Carlo, and stores the payload in KV.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const t0 = Date.now();
  const payload = await computePredictions(20000);
  await kvSetJSON("predictions:latest", payload);
  return NextResponse.json({
    ok: true,
    updatedAt: payload.updatedAt,
    matchesPlayed: payload.matchesPlayed,
    iterations: payload.iterations,
    tookMs: Date.now() - t0,
  });
}
