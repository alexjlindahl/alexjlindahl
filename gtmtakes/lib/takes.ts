import { getDb } from "./db";
import { addDays, today } from "./dates";
import { type Counts, controversyScore, extractFeatures, learn, pickLineup, predict, type Model, type Pattern } from "./scoring";

export interface TakeRow {
  id: number;
  source_id: string | null;
  source_url: string;
  author_handle: string;
  author_name: string | null;
  original_text: string;
  posted_at: string | null;
  statement: string;
  topic: string;
  status: "candidate" | "approved" | "rejected";
  debate_score: number | null;
  llm_reason: string | null;
  llm_model: string | null;
  created_at: string;
}

export interface TakeWithCounts extends TakeRow {
  day: string | null;
  position: number | null;
  counts: Counts;
}

const COUNT_COLS = `
  COALESCE(SUM(CASE WHEN v.choice = 'hot' THEN 1 ELSE 0 END), 0) AS hot,
  COALESCE(SUM(CASE WHEN v.choice = 'not' THEN 1 ELSE 0 END), 0) AS not_count,
  COALESCE(SUM(CASE WHEN v.choice = 'depends' THEN 1 ELSE 0 END), 0) AS depends`;

const TAKE_COLS = `t.id, t.source_id, t.source_url, t.author_handle, t.author_name, t.original_text, t.posted_at,
  t.statement, t.topic, t.status, t.debate_score, t.llm_reason, t.llm_model, t.created_at`;

const SELECT_WITH_COUNTS = `
  SELECT ${TAKE_COLS}, d.day, d.position, ${COUNT_COLS}
  FROM takes t
  LEFT JOIN daily_takes d ON d.take_id = t.id
  LEFT JOIN votes v ON v.take_id = t.id`;

const GROUP = `GROUP BY ${TAKE_COLS}, d.day, d.position`;

type Raw = TakeRow & { day: string | null; position: number | null; hot: unknown; not_count: unknown; depends: unknown };

// Postgres returns SUM() as a string; normalise to numbers.
function shape(r: Raw): TakeWithCounts {
  const { hot, not_count, depends, ...rest } = r;
  return {
    ...rest,
    id: Number(rest.id),
    position: rest.position == null ? null : Number(rest.position),
    debate_score: rest.debate_score == null ? null : Number(rest.debate_score),
    counts: { hot: Number(hot), not: Number(not_count), depends: Number(depends) },
  };
}

async function query(where: string, params: unknown[] = [], tail = ""): Promise<TakeWithCounts[]> {
  const db = await getDb();
  const rows = await db.all<Raw>(`${SELECT_WITH_COUNTS} ${where} ${GROUP} ${tail}`, params);
  return rows.map(shape);
}

export async function getTake(id: number): Promise<TakeWithCounts | undefined> {
  return (await query("WHERE t.id = ?", [id]))[0];
}

export async function getDay(day: string): Promise<TakeWithCounts[]> {
  return query("WHERE d.day = ?", [day], "ORDER BY d.position");
}

export async function getRange(fromDay: string, toDay: string): Promise<TakeWithCounts[]> {
  return query("WHERE d.day >= ? AND d.day <= ?", [fromDay, toDay], "ORDER BY d.day, d.position");
}

export async function listByStatus(status: TakeRow["status"]): Promise<TakeWithCounts[]> {
  return query("WHERE t.status = ? AND d.day IS NULL", [status], "ORDER BY t.id DESC");
}

export async function listDays(beforeOrOn: string): Promise<{ day: string; takes: number }[]> {
  const db = await getDb();
  const rows = await db.all<{ day: string; takes: unknown }>(
    "SELECT day, COUNT(*) AS takes FROM daily_takes WHERE day <= ? GROUP BY day ORDER BY day DESC",
    [beforeOrOn],
  );
  return rows.map((r) => ({ day: r.day, takes: Number(r.takes) }));
}

/** Top takes of a calendar month (YYYY-MM) by controversy score. Only days up to `upTo` count. */
export async function monthLeaderboard(month: string, upTo: string, limit = 20): Promise<TakeWithCounts[]> {
  const takes = await getRange(`${month}-01`, upTo < `${month}-31` ? upTo : `${month}-31`);
  return takes
    .filter((t) => t.counts.hot + t.counts.not > 0)
    .sort((a, b) => controversyScore(b.counts) - controversyScore(a.counts))
    .slice(0, limit);
}

export async function hasSeedVotes(): Promise<boolean> {
  const db = await getDb();
  return !!(await db.get("SELECT 1 AS x FROM votes WHERE source = 'seed' LIMIT 1"));
}

// ---------------------------------------------------------------------------
// Learning + scheduling
// ---------------------------------------------------------------------------

/** Fits the model on every take that has been shown and voted on. */
export async function fitModel(): Promise<Model> {
  const shown = await query("WHERE d.day IS NOT NULL");
  return learn(shown.map((t) => ({ features: extractFeatures(t.statement, t.topic), counts: t.counts })));
}

/** Refits the model and stores the per-feature patterns (shown on /admin and in the weekly export). */
export async function refreshPatterns(): Promise<Model> {
  const db = await getDb();
  const model = await fitModel();
  const now = new Date().toISOString();
  await db.run("DELETE FROM patterns");
  for (const p of model.patterns.values()) {
    await db.run("INSERT INTO patterns (feature, n_takes, avg_divisiveness, lift, updated_at) VALUES (?, ?, ?, ?, ?)", [
      p.feature,
      p.nTakes,
      p.avgDivisiveness,
      p.lift,
      now,
    ]);
  }
  return model;
}

export async function getPatterns(): Promise<Pattern[]> {
  const db = await getDb();
  const rows = await db.all<{ feature: string; n_takes: unknown; avg_divisiveness: unknown; lift: unknown }>(
    "SELECT feature, n_takes, avg_divisiveness, lift FROM patterns ORDER BY lift DESC",
  );
  return rows.map((r) => ({ feature: r.feature, nTakes: Number(r.n_takes), avgDivisiveness: Number(r.avg_divisiveness), lift: Number(r.lift) }));
}

export interface RankedTake extends TakeWithCounts {
  features: string[];
  predicted: number;
  rank: number;
}

export function rankTakes(model: Model, takes: TakeWithCounts[]): RankedTake[] {
  return takes
    .map((t) => {
      const features = extractFeatures(t.statement, t.topic);
      const p = predict(model, features, t.debate_score);
      return { ...t, features, predicted: p.predicted, rank: p.rank };
    })
    .sort((a, b) => b.rank - a.rank || a.id - b.id);
}

/** Approved takes that have not been scheduled yet, best first. */
export async function rankedPool(status: TakeRow["status"] = "approved"): Promise<RankedTake[]> {
  return rankTakes(await fitModel(), await listByStatus(status));
}

export const LINEUP_SIZE = 10;

export async function scheduleTake(day: string, takeId: number): Promise<boolean> {
  const db = await getDb();
  const existing = await db.all<{ position: unknown }>("SELECT position FROM daily_takes WHERE day = ?", [day]);
  const used = new Set(existing.map((r) => Number(r.position)));
  if (used.size >= LINEUP_SIZE) return false;
  let position = 1;
  while (used.has(position)) position++;
  const r = await db.run("INSERT INTO daily_takes (day, position, take_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", [day, position, takeId]);
  return r.changes > 0;
}

export async function unscheduleTake(day: string, takeId: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM daily_takes WHERE day = ? AND take_id = ?", [day, takeId]);
}

/** Fills the remaining slots of `day` with the best-ranked approved takes. Returns how many were added. */
export async function autoSchedule(day: string): Promise<number> {
  const current = await getDay(day);
  const open = LINEUP_SIZE - current.length;
  if (open <= 0) return 0;
  const pool = await rankedPool("approved");
  // Respect variety across the whole day, including takes already in the lineup.
  const fixed = current.map((t) => ({ ...t, rank: Number.MAX_SAFE_INTEGER }));
  const lineup = pickLineup([...fixed, ...pool], LINEUP_SIZE);
  let added = 0;
  for (const t of lineup) {
    if (current.some((c) => c.id === t.id)) continue;
    if (await scheduleTake(day, t.id)) added++;
  }
  return added;
}

/**
 * Today's lineup. If nobody scheduled today in /admin, fall back to the
 * best-ranked approved takes so the site never shows an empty day.
 */
export async function ensureToday(): Promise<TakeWithCounts[]> {
  const day = today();
  let takes = await getDay(day);
  if (takes.length === 0 && (await autoSchedule(day)) > 0) takes = await getDay(day);
  return takes;
}

export const tomorrow = () => addDays(today(), 1);
