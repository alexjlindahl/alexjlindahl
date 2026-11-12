import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { today } from "@/lib/dates";
import { split } from "@/lib/scoring";
import { getTake } from "@/lib/takes";

export const dynamic = "force-dynamic";

const INK = "#141210";
const PAPER = "#fff4df";
const HOT = "#e62e1f";
const NOT = "#2450f0";

let font: Promise<Buffer> | undefined;
const loadFont = () => (font ??= readFile(join(process.cwd(), "assets/fonts/ArchivoBlack.woff")));

/** 1200x630 PNG share card: the take, the split, and the site name. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const take = /^\d+$/.test(id) ? await getTake(Number(id)) : undefined;
  if (!take || !take.day || take.day > today()) return new Response("Not found", { status: 404 });

  const s = split(take.counts);
  const len = take.statement.length;
  const size = len < 45 ? 84 : len < 75 ? 70 : len < 105 ? 58 : 50;
  const headers: Record<string, string> = { "cache-control": "public, max-age=60, s-maxage=60" };
  if (new URL(req.url).searchParams.has("download")) headers["content-disposition"] = `attachment; filename="gtmtakes-${take.id}.png"`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, padding: 56, fontFamily: "Archivo Black" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <div style={{ display: "flex" }}>
            <span style={{ color: HOT }}>HOT</span>
            <span style={{ margin: "0 12px" }}>OR</span>
            <span style={{ color: NOT }}>NOT?</span>
          </div>
          <div style={{ display: "flex", color: "#6b6257", fontSize: 26 }}>@{take.author_handle} on X</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: size, lineHeight: 1.08, letterSpacing: -1 }}>{take.statement}</div>

        {s.decided > 0 ? (
          <div style={{ display: "flex", height: 96, border: `5px solid ${INK}`, borderRadius: 22, overflow: "hidden", boxShadow: `8px 8px 0 ${INK}`, fontSize: 44, color: "white" }}>
            <div style={{ display: "flex", alignItems: "center", paddingLeft: 24, background: HOT, width: `${Math.min(86, Math.max(14, s.hotPct))}%`, borderRight: `5px solid ${INK}` }}>{s.hotPct}%</div>
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end", paddingRight: 24, background: NOT }}>{s.notPct}%</div>
          </div>
        ) : (
          <div style={{ display: "flex", height: 96, border: `5px solid ${INK}`, borderRadius: 22, boxShadow: `8px 8px 0 ${INK}`, alignItems: "center", justifyContent: "center", fontSize: 40, background: "#ffc83a" }}>
            Voting is open
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 26, fontSize: 26 }}>
          <div style={{ display: "flex" }}>
            <span style={{ color: HOT }}>{s.decided > 0 ? "HOT" : ""}</span>
          </div>
          <div style={{ display: "flex", fontSize: 40 }}>
            gtmtakes<span style={{ color: HOT }}>.</span>here
          </div>
          <div style={{ display: "flex" }}>
            <span style={{ color: NOT }}>{s.decided > 0 ? "NOT" : ""}</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers, fonts: [{ name: "Archivo Black", data: await loadFont(), weight: 400, style: "normal" }] },
  );
}
