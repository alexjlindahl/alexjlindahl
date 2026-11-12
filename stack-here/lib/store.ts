import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { analyze, type AnalyzeInput } from "./grade";
import { TOOLS, getTool } from "./tools";
import type { AnalysisResult, LearnedRules } from "./types";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newId(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const CUT_REASONS: Record<string, string> = {
  overlap: "Another tool already did the job",
  cost: "Too expensive for what we got",
  unused: "Nobody was using it",
  quality: "Data or output quality was poor",
  replaced: "Replaced by a different tool",
  other: "Something else",
};

// ---- Learned rules ------------------------------------------------------------------------------

let rulesCache: { at: number; rules: LearnedRules | null } | null = null;

export async function getLearnedRules(): Promise<LearnedRules | null> {
  if (rulesCache && Date.now() - rulesCache.at < 60_000) return rulesCache.rules;
  const db = await getDb();
  const rows = await db.all<{ data: string }>("SELECT data FROM learned_rules WHERE id = 1");
  const rules = rows[0] ? (JSON.parse(rows[0].data) as LearnedRules) : null;
  rulesCache = { at: Date.now(), rules };
  return rules;
}

export async function saveLearnedRules(rules: LearnedRules): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO learned_rules (id, data, updated_at) VALUES (1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    [JSON.stringify(rules), now],
  );
  rulesCache = null;
}

// ---- Submissions --------------------------------------------------------------------------------

/** Unrecognized names are kept only as anonymous counts, and only if they look like a product name. */
function safeUnknown(name: string): string | null {
  const n = name.toLowerCase().trim();
  if (n.length < 2 || n.length > 30) return null;
  if (/[@:/\\]|\d{4,}|https?|www\./.test(n)) return null;
  if (n.split(/\s+/).length > 3) return null;
  return n;
}

export async function createSubmission(input: AnalyzeInput): Promise<{ id: string; result: AnalysisResult }> {
  const db = await getDb();
  const learned = await getLearnedRules();
  const result = analyze(input, { tools: TOOLS, learned });
  const id = newId();
  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO submissions (id, tools, team_size, score, grade, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, JSON.stringify([...result.tools].sort()), result.teamSize, result.score, result.grade, JSON.stringify(result), now],
  );
  for (const raw of new Set(result.unknown)) {
    const name = safeUnknown(raw);
    if (!name) continue;
    await db.run(
      `INSERT INTO unknown_tools (name, count, last_seen) VALUES (?, 1, ?)
       ON CONFLICT (name) DO UPDATE SET count = unknown_tools.count + 1, last_seen = excluded.last_seen`,
      [name, now],
    );
  }
  return { id, result };
}

export async function getSubmission(id: string): Promise<{ id: string; result: AnalysisResult; createdAt: string } | null> {
  if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
  const db = await getDb();
  const rows = await db.all<{ id: string; result: string; created_at: string }>(
    "SELECT id, result, created_at FROM submissions WHERE id = ?",
    [id],
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, result: JSON.parse(rows[0].result) as AnalysisResult, createdAt: rows[0].created_at };
}

// ---- Cuts ---------------------------------------------------------------------------------------

export interface CutInput {
  submissionId?: string | null;
  toolId: string;
  reason: string;
  replacedBy?: string | null;
  note?: string | null;
}

export async function recordCut(input: CutInput): Promise<void> {
  if (!getTool(input.toolId)) throw new Error("Unknown tool");
  if (!CUT_REASONS[input.reason]) throw new Error("Unknown reason");
  const replacedBy = input.replacedBy && getTool(input.replacedBy) ? input.replacedBy : null;
  // Notes are free text, so strip anything that looks like an email, URL or phone number.
  const note = (input.note ?? "")
    .replace(/\S+@\S+/g, "[removed]")
    .replace(/https?:\/\/\S+/g, "[removed]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[removed]")
    .trim()
    .slice(0, 280);
  const submissionId = input.submissionId && /^[a-z0-9]{6,16}$/.test(input.submissionId) ? input.submissionId : null;
  const db = await getDb();
  await db.run(
    "INSERT INTO cuts (id, submission_id, tool_id, reason, replaced_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [newId(12), submissionId, input.toolId, input.reason, replacedBy, note || null, new Date().toISOString()],
  );
}

// ---- Raw reads for insights and the refresh job ---------------------------------------------------

export interface SubmissionRow {
  id: string;
  tools: string[];
  teamSize: number | null;
  score: number;
  grade: string;
  result: AnalysisResult;
  createdAt: string;
}

export async function recentSubmissions(limit = 5000): Promise<SubmissionRow[]> {
  const db = await getDb();
  const rows = await db.all<{ id: string; tools: string; team_size: number | null; score: number; grade: string; result: string; created_at: string }>(
    `SELECT id, tools, team_size, score, grade, result, created_at FROM submissions ORDER BY created_at DESC LIMIT ${Math.floor(limit)}`,
  );
  return rows.map((r) => ({
    id: r.id,
    tools: JSON.parse(r.tools),
    teamSize: r.team_size,
    score: Number(r.score),
    grade: r.grade,
    result: JSON.parse(r.result),
    createdAt: r.created_at,
  }));
}

export interface CutRow {
  toolId: string;
  reason: string;
  replacedBy: string | null;
  note: string | null;
  createdAt: string;
}

export async function recentCuts(limit = 5000): Promise<CutRow[]> {
  const db = await getDb();
  const rows = await db.all<{ tool_id: string; reason: string; replaced_by: string | null; note: string | null; created_at: string }>(
    `SELECT tool_id, reason, replaced_by, note, created_at FROM cuts ORDER BY created_at DESC LIMIT ${Math.floor(limit)}`,
  );
  return rows.map((r) => ({ toolId: r.tool_id, reason: r.reason, replacedBy: r.replaced_by, note: r.note, createdAt: r.created_at }));
}

export async function topUnknown(limit = 30): Promise<{ name: string; count: number }[]> {
  const db = await getDb();
  const rows = await db.all<{ name: string; count: number }>(
    `SELECT name, count FROM unknown_tools ORDER BY count DESC, name ASC LIMIT ${Math.floor(limit)}`,
  );
  return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}
