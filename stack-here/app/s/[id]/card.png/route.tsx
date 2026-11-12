import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getSubmission } from "@/lib/store";
import { categoryOf } from "@/lib/taxonomy";
import { getTool } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRADE_BG: Record<string, string> = { A: "#16A34A", B: "#65A30D", C: "#CA8A04", D: "#EA580C", F: "#DC2626" };

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 900; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    ([500, 700, 900] as const).map(async (weight) => ({
      name: "Inter",
      data: await readFile(path.join(process.cwd(), "assets/fonts", `inter-latin-${weight}-normal.woff`)),
      weight,
      style: "normal" as const,
    })),
  );
  return fonts;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sub = await getSubmission(id);
  if (!sub) return new Response("Not found", { status: 404 });
  const r = sub.result;
  const tools = r.tools.map(getTool).filter((t) => !!t);
  const MAX = 8;
  const shown = tools.slice(0, MAX);
  const extra = tools.length - shown.length;
  const roastSize = r.roast.length > 70 ? 40 : r.roast.length > 48 ? 46 : 54;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          color: "#000",
          fontFamily: "Inter",
          padding: 56,
        }}
      >
        <div style={{ display: "flex", flex: 1, gap: 52 }}>
          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: 40,
              background: GRADE_BG[r.grade] ?? "#000",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 250,
              fontWeight: 900,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {r.grade}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "#737373" }}>
              MY GTM STACK · {r.score}/100
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: roastSize,
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: -1.5,
              }}
            >
              {r.roast}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          {shown.map((t) => {
            const c = categoryOf(t!.category);
            return (
              <div
                key={t!.id}
                style={{
                  display: "flex",
                  background: c.bg,
                  color: c.fg,
                  borderRadius: 999,
                  padding: "10px 22px",
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                {t!.name.length > 22 ? t!.name.slice(0, 21) + "…" : t!.name}
              </div>
            );
          })}
          {extra > 0 && (
            <div
              style={{
                display: "flex",
                border: "2px solid #000",
                borderRadius: 999,
                padding: "8px 20px",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              +{extra} more
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: 28,
            paddingTop: 22,
            borderTop: "3px solid #000",
          }}
        >
          <div style={{ display: "flex", fontSize: 40, fontWeight: 900, letterSpacing: -1 }}>stack.here</div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "#737373" }}>
            {r.waste.high > 0
              ? `Est. $${r.waste.low.toLocaleString("en-US")} to $${r.waste.high.toLocaleString("en-US")}/yr in duplicate tools`
              : "Grade your GTM stack"}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: await loadFonts(),
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
