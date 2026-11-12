import { NextResponse } from "next/server";
import { recordCut } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await recordCut({
      submissionId: typeof body.submissionId === "string" ? body.submissionId : null,
      toolId: String(body.toolId ?? ""),
      reason: String(body.reason ?? ""),
      replacedBy: typeof body.replacedBy === "string" ? body.replacedBy : null,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid request." }, { status: 400 });
  }
}
