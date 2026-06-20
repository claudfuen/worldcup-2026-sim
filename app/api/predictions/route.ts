import { NextResponse } from "next/server";
import { kvGetJSON, kvSetJSON, KV_CONFIGURED } from "@/lib/kv";
import { computePredictions, type PredictionsPayload } from "@/lib/predictions";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  if (KV_CONFIGURED) {
    const cached = await kvGetJSON<PredictionsPayload>("predictions:latest");
    if (cached) return NextResponse.json(cached);
  }
  const fresh = await computePredictions(20000);
  if (KV_CONFIGURED) await kvSetJSON("predictions:latest", fresh).catch(() => {});
  return NextResponse.json(fresh);
}
