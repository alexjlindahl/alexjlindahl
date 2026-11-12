const tables = (pk: string) => `
CREATE TABLE IF NOT EXISTS takes (
  id ${pk},
  source_id TEXT UNIQUE,
  source_url TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_name TEXT,
  original_text TEXT NOT NULL,
  posted_at TEXT,
  statement TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  debate_score REAL,
  llm_reason TEXT,
  llm_model TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_takes (
  day TEXT NOT NULL,
  position INTEGER NOT NULL,
  take_id INTEGER NOT NULL UNIQUE REFERENCES takes(id),
  PRIMARY KEY (day, position)
);
CREATE TABLE IF NOT EXISTS votes (
  id ${pk},
  take_id INTEGER NOT NULL REFERENCES takes(id),
  choice TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'live',
  created_at TEXT NOT NULL,
  UNIQUE (take_id, voter_id)
);
CREATE INDEX IF NOT EXISTS votes_take_ip ON votes (take_id, ip_hash);
CREATE TABLE IF NOT EXISTS patterns (
  feature TEXT PRIMARY KEY,
  n_takes INTEGER NOT NULL,
  avg_divisiveness REAL NOT NULL,
  lift REAL NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

export const SCHEMA = {
  sqlite: tables("INTEGER PRIMARY KEY AUTOINCREMENT"),
  postgres: tables("SERIAL PRIMARY KEY"),
};
