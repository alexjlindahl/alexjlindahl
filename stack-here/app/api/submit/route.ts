import { NextResponse } from "next/server";
import { createMatcher } from "@/lib/parse";
import { createSubmission } from "@/lib/store";
import { TOOLS } from "@/lib/tools";

export const runtime = "nodejs";

const matcher = createMatcher(TOOLS);

export async function POST(req: Request) {
  let body: { text?: unknown; teamSize?: unknown; seats?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, 5000) : "";
  const parsed = matcher.parse(text);
  if (!parsed.matched.length) {
    return NextResponse.json(
      { error: "We didn't recognize any tools in that. Try names separated by commas." },
      { status: 422 },
    );
  }
  const matched = parsed.matched.slice(0, 60);
  const teamSize = Number.isFinite(Number(body.teamSize)) && Number(body.teamSize) > 0 ? Math.min(100000, Math.round(Number(body.teamSize))) : null;

  const seats: Record<string, number> = {};
  for (const m of matched) if (m.seats) seats[m.toolId] = m.seats;
  if (body.seats && typeof body.seats === "object") {
    for (const [id, v] of Object.entries(body.seats as Record<string, unknown>)) {
      const n = Math.round(Number(v));
      if (n > 0 && n <= 100000 && matched.some((m) => m.toolId === id)) seats[id] = n;
    }
  }

  const { id, result } = await createSubmission({
    toolIds: matched.map((m) => m.toolId),
    unknown: parsed.unknown.slice(0, 20),
    teamSize,
    seats,
  });
  return NextResponse.json({ id, grade: result.grade, score: result.score });
}
