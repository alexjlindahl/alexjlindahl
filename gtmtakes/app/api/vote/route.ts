import { NextResponse, type NextRequest } from "next/server";
import { castVote, newVoterId, VOTER_COOKIE } from "@/lib/votes";

export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { takeId?: unknown; choice?: unknown } | null;
  if (!body) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });

  const existing = req.cookies.get(VOTER_COOKIE)?.value;
  const voterId = existing && /^[0-9a-f-]{36}$/.test(existing) ? existing : newVoterId();
  const result = await castVote({ takeId: Number(body.takeId), choice: String(body.choice), voterId, ip: clientIp(req) });

  const res = result.ok
    ? NextResponse.json({ counts: result.counts, choice: result.choice, duplicate: result.duplicate })
    : NextResponse.json({ error: result.error }, { status: result.status });
  if (voterId !== existing) {
    res.cookies.set(VOTER_COOKIE, voterId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  }
  return res;
}
