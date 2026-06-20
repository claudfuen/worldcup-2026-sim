import { NextResponse } from "next/server";
import { computeSourceData } from "@/lib/sourceData";
import { kvGetJSON, KV_CONFIGURED, PRED_KEY } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Ground-truth + raw-state endpoint for QA: fresh source data (results, ratings, standings, clinch)
// plus the currently-stored KV prediction payload, so predictions can be checked against the source.
export async function GET() {
  const source = await computeSourceData();
  const kvPayload = KV_CONFIGURED ? await kvGetJSON(PRED_KEY).catch(() => null) : null;
  return NextResponse.json({
    source,
    kv: {
      key: PRED_KEY,
      stored: kvPayload,
    },
  });
}
