import { NextResponse } from "next/server";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED, PRED_KEY } from "@/lib/kv";
import { computePredictions, type PredictionsPayload } from "@/lib/predictions";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  if (KV_CONFIGURED) {
    const cached = await kvGetJSON<PredictionsPayload>(PRED_KEY);
    if (cached) return NextResponse.json(cached);
  }
  const fresh = await computePredictions(20000);
  if (KV_CONFIGURED) await kvSetJSON(PRED_KEY, fresh).catch(() => {});
  return NextResponse.json(fresh);
}
