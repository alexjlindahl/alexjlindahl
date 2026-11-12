# PLAN — gtmtakes.here

Resume rule: read this file top to bottom, then `git log --oneline`, then continue at the first unchecked box.
Decisions and their reasons live in LOG.md.

## Milestones
- [x] M0 Scaffold Next.js 16 + Tailwind 4 in `gtmtakes/` (repo root is the GitHub profile README, left untouched)
- [x] M1 Data layer: DB adapter (SQLite / Postgres), schema, dates
- [x] M2 Scoring + self-learning model (pure functions) with tests
- [x] M3 Voting logic (cookie + hashed IP) with tests (API route comes with M4)
- [x] M4 Public pages: daily vote flow, results, archive, monthly leaderboard, take page
- [x] M5 Share card (1200x630 PNG) + OG metadata
- [x] M6 Pipeline: scripts/fetch_takes (X API or CSV), LLM filter/rewrite step
- [x] M7 Admin: approve/reject, edit, schedule tomorrow's 10
- [x] M8 Weekly export -> output/weekly.md with tests
- [x] M9 Seed 3 days with real, verified X posts
- [x] M10 Verify end to end in a browser, build passes, tests pass
- [x] M11 DONE.md, final push

## Status
All milestones done. See DONE.md for how to run, what is real versus placeholder, and what needs review.

## Ideas not built (not in the brief)
- Vercel Cron to run `fetch-takes` nightly and email the weekly export
- Rate limiting at the edge (per-IP request throttling) in addition to the per-take vote cap
- Letting voters change their vote before the day closes
