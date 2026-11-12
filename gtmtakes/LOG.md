# LOG — decisions made while building gtmtakes.here

Newest at the bottom. Each entry: what was decided, and why.

1. **App lives in `gtmtakes/`, not the repo root.** This repo is the GitHub profile repo (its README renders on the profile page). Putting a Next.js app at the root would bury that. On Vercel, set Root Directory to `gtmtakes`. All paths in the brief (`/scripts/fetch_takes`, `/output/weekly.md`, PLAN/LOG/DONE) are relative to `gtmtakes/`.
2. **No `.env`, no `X_BEARER_TOKEN`, no `ANTHROPIC_API_KEY` in this environment.** So the pipeline is built with both paths (X API and CSV import), but only the CSV path could be exercised here.
3. **Seed takes must be real.** Posts were found by web search and each one verified against X's public embed endpoint (`cdn.syndication.twimg.com/tweet-result`), which returns the post text and author. Nothing in the seed was typed from memory.
4. **Turned off `cacheComponents` in next.config.** Every page reads live vote counts; the older `dynamic = "force-dynamic"` model is simpler and has no stale-split risk.
5. **SQLite via better-sqlite3 locally, Postgres via `pg` when `DATABASE_URL` is set.** One small adapter, portable SQL (`?` placeholders rewritten to `$n`), dates stored as ISO text in both. The Postgres dialect is tested against PGlite (real Postgres compiled to WASM) since no Postgres server was assumed.
