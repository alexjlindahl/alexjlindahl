import { NextResponse } from "next/server";
import { refreshLearnedRules } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Called by Vercel Cron (see vercel.json), which sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" || secret) {
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const rules = await refreshLearnedRules();
  return NextResponse.json({
    version: rules.version,
    sampleSize: rules.sampleSize,
    jobWeightsAdjusted: Object.keys(rules.jobWeight).length,
    toolsPenalized: Object.keys(rules.toolCutPenalty).length,
  });
}
