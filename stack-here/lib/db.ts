/**
 * Tiny database layer: Postgres when DATABASE_URL is set, otherwise a local SQLite file.
 * SQL is written with `?` placeholders and kept to the subset both engines accept.
 */
import fs from "node:fs";
import path from "node:path";

export interface Db {
  kind: "sqlite" | "postgres";
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    tools TEXT NOT NULL,
    team_size INTEGER,
    score INTEGER NOT NULL,
    grade TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cuts (
    id TEXT PRIMARY KEY,
    submission_id TEXT,
    tool_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    replaced_by TEXT,
    note TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS unknown_tools (
    name TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    last_seen TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS learned_rules (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS submissions_created ON submissions (created_at)`,
  `CREATE INDEX IF NOT EXISTS cuts_tool ON cuts (tool_id)`,
];

async function openSqlite(): Promise<Db> {
  const { default: Database } = await import("better-sqlite3");
  const file =
    process.env.SQLITE_PATH ||
    (process.env.VERCEL ? "/tmp/stack-here.db" : path.join(process.cwd(), ".data", "stack-here.db"));
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  for (const stmt of SCHEMA) db.exec(stmt);
  return {
    kind: "sqlite",
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...params);
    },
  };
}

async function openPostgres(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const local = /localhost|127\.0\.0\.1|\/var\/run/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  const convert = (sql: string) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  for (const stmt of SCHEMA) await pool.query(stmt);
  return {
    kind: "postgres",
    async all<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(convert(sql), params);
      return res.rows as T[];
    },
    async run(sql, params = []) {
      await pool.query(convert(sql), params);
    },
  };
}

const globalForDb = globalThis as unknown as { __stackHereDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__stackHereDb) {
    const url = process.env.DATABASE_URL;
    globalForDb.__stackHereDb = (url ? openPostgres(url) : openSqlite()).catch((err) => {
      globalForDb.__stackHereDb = undefined;
      throw err;
    });
  }
  return globalForDb.__stackHereDb;
}

/** For tests and scripts that need a fresh connection. */
export function resetDb() {
  globalForDb.__stackHereDb = undefined;
}
