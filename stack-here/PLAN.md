# stack.here — plan

Status legend: [ ] todo · [~] in progress · [x] done

- [x] 0. Repo layout, schema, plan/log files
- [x] 1. Tool database research (6 parallel batches -> data/parts/*.json -> data/tools.json)
- [x] 2. Next.js + Tailwind scaffold
- [x] 3. Core lib: parser (fuzzy), grader, overlaps, waste, gaps, roast
- [x] 4. DB layer (SQLite / Postgres), submissions, cuts, learned rules
- [x] 5. Pages: home, /s/[id] result, "I cut a tool", /insights
- [x] 6. Share card PNG (1200x630) + OG metadata
- [x] 7. Refresh job (learning loop) + cron
- [x] 8. Tests (parsing, grading), 10 sample stacks, browser check
- [x] 9. DONE.md, final commit + push

Resume notes: see LOG.md (newest entries at bottom).

## Next (not started)
- Verify the 26 "unverified" prices by hand (list in DONE.md).
- Rate limiting on /api/submit and /api/cut.
- Review candidate overlap pairs from /insights once real data arrives.
