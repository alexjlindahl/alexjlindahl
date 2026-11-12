import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHEMA } from "./schema";

/**
 * Tiny DB adapter. SQL is written once with `?` placeholders and runs on
 * SQLite (default) or Postgres (when DATABASE_URL is set).
 */
export interface DB {
  dialect: "sqlite" | "postgres";
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  close(): Promise<void>;
}

export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function openSqlite(path: string): Promise<DB> {
  const { default: Database } = await import("better-sqlite3");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  const db: DB = {
    dialect: "sqlite",
    async all<T>(sql: string, params: unknown[] = []) {
      const stmt = raw.prepare(sql);
      if (stmt.reader) return stmt.all(...params) as T[];
      stmt.run(...params);
      return [];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (await db.all<T>(sql, params))[0];
    },
    async run(sql: string, params: unknown[] = []) {
      const stmt = raw.prepare(sql);
      if (stmt.reader) return { changes: stmt.all(...params).length };
      return { changes: stmt.run(...params).changes };
    },
    async close() {
      raw.close();
    },
  };
  raw.exec(SCHEMA.sqlite);
  return db;
}

/** Minimal shape shared by `pg.Pool` and PGlite (used in tests). */
export interface PgLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null; affectedRows?: number }>;
  end?: () => Promise<void>;
  close?: () => Promise<void>;
}

export async function wrapPostgres(pg: PgLike): Promise<DB> {
  const db: DB = {
    dialect: "postgres",
    async all<T>(sql: string, params: unknown[] = []) {
      return (await pg.query(toPgPlaceholders(sql), params)).rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (await db.all<T>(sql, params))[0];
    },
    async run(sql: string, params: unknown[] = []) {
      const r = await pg.query(toPgPlaceholders(sql), params);
      return { changes: r.rowCount ?? r.affectedRows ?? 0 };
    },
    async close() {
      await (pg.end ?? pg.close)?.call(pg);
    },
  };
  for (const stmt of SCHEMA.postgres.split(";").map((s) => s.trim()).filter(Boolean)) {
    await pg.query(stmt);
  }
  return db;
}

async function open(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const local = /localhost|127\.0\.0\.1/.test(url);
    return wrapPostgres(new Pool({ connectionString: url, max: 3, ssl: local ? undefined : { rejectUnauthorized: false } }) as unknown as PgLike);
  }
  // Vercel's filesystem is read-only except /tmp. SQLite there is ephemeral:
  // fine for a preview, not for production (set DATABASE_URL).
  const path = process.env.SQLITE_PATH ?? (process.env.VERCEL ? "/tmp/gtmtakes.db" : join(process.cwd(), "data", "gtmtakes.db"));
  return openSqlite(path);
}

const g = globalThis as unknown as { __gtmtakesDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!g.__gtmtakesDb) g.__gtmtakesDb = open();
  return g.__gtmtakesDb;
}

/** Tests inject their own database. */
export function setDb(db: DB | null) {
  g.__gtmtakesDb = db ? Promise.resolve(db) : undefined;
}
