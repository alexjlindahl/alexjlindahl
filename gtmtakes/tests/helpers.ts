import { PGlite } from "@electric-sql/pglite";
import { type DB, type PgLike, openSqlite, setDb, wrapPostgres } from "@/lib/db";
import { getDb } from "@/lib/db";

export const BACKENDS = ["sqlite", "postgres"] as const;

/** Fresh empty database, installed as the app's database for the duration of a test. */
export async function freshDb(backend: (typeof BACKENDS)[number] = "sqlite"): Promise<DB> {
  const db = backend === "sqlite" ? await openSqlite(":memory:") : await wrapPostgres(new PGlite() as unknown as PgLike);
  setDb(db);
  return db;
}

let n = 0;
export async function addTake(over: Partial<{ statement: string; topic: string; handle: string; status: string; day: string; debate: number }> = {}): Promise<number> {
  const db = await getDb();
  n++;
  const row = await db.get<{ id: number }>(
    `INSERT INTO takes (source_id, source_url, author_handle, original_text, statement, topic, status, debate_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [`src${n}`, `https://x.com/${over.handle ?? `user${n}`}/status/${1000 + n}`, over.handle ?? `user${n}`, "original post text", over.statement ?? `Take number ${n}`, over.topic ?? "outbound", over.status ?? "approved", over.debate ?? null, "2026-01-01T00:00:00Z"],
  );
  const id = Number(row!.id);
  if (over.day) {
    const pos = await db.get<{ n: unknown }>("SELECT COUNT(*) AS n FROM daily_takes WHERE day = ?", [over.day]);
    await db.run("INSERT INTO daily_takes (day, position, take_id) VALUES (?, ?, ?)", [over.day, Number(pos!.n) + 1, id]);
  }
  return id;
}

let v = 0;
export async function addVotes(takeId: number, hot: number, not: number, depends = 0, source = "live") {
  const db = await getDb();
  for (const [choice, count] of [["hot", hot], ["not", not], ["depends", depends]] as const) {
    for (let i = 0; i < count; i++) {
      v++;
      await db.run("INSERT INTO votes (take_id, choice, voter_id, ip_hash, source, created_at) VALUES (?, ?, ?, ?, ?, ?)", [takeId, choice, `voter${v}`, `ip${v}`, source, "2026-01-01T00:00:00Z"]);
    }
  }
}
