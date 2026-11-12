# DONE — gtmtakes.here

Everything in the brief is built and runs locally. Three things were not possible to exercise here and are flagged below: the live X API fetch, the live LLM call, and a real Vercel deploy.

## Run it

```bash
cd gtmtakes
cp .env.example .env        # set ADMIN_PASSWORD at minimum
npm install
npm run seed                # 72 real takes + 3 days (2 days ago, yesterday, today) + sample votes
npm run dev                 # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | The site |
| `npm test` | 45 tests: scoring, learning, voting, export, pipeline |
| `npm run seed` | Load seed takes and three sample days. `-- --no-votes` skips the generated votes |
| `npm run seed:clear-votes` | Delete all generated sample votes |
| `npm run fetch-takes` | Pull candidates from X (needs `X_BEARER_TOKEN`), or `-- --csv file.csv` to import by hand |
| `npm run export:weekly` | Write `output/weekly.md`. Options: `-- --week-ending YYYY-MM-DD --min-votes N` |

Pages: `/` (today's 10), `/results` and `/results/YYYY-MM-DD`, `/archive`, `/leaderboard` (this month), `/take/[id]` (share page), `/api/card/[id]` (1200x630 PNG), `/admin`.

## The daily routine

1. `npm run fetch-takes` (or a CSV import) adds candidates to the review queue.
2. In `/admin`: check each rewrite against the original post, edit, approve or reject.
3. Still in `/admin`: "Auto-fill with top-ranked takes" schedules tomorrow's 10 from what the site has learned, or add takes one by one. If you skip this, the site fills the day itself from the approved pool.
4. Once a week: `npm run export:weekly`, then paste `output/weekly.md` into the newsletter.

## Deploy to Vercel

1. Import the repo and set **Root Directory** to `gtmtakes`.
2. Add a Postgres database (Neon or Supabase through the Vercel Marketplace) and set `DATABASE_URL`. Tables are created on first connection.
3. Set `ADMIN_PASSWORD`, `NEXT_PUBLIC_SITE_URL` (your real domain), and `IP_HASH_SALT` (a long random string). Optional: `SITE_TZ`, `MAX_VOTES_PER_IP`.
4. Load the takes into production once, from your machine: `DATABASE_URL=... npm run seed -- --no-votes`.
5. `fetch-takes` and `export:weekly` are scripts, not routes. Run them locally with the production `DATABASE_URL` in `.env`.

Without `DATABASE_URL`, a Vercel deploy falls back to SQLite in `/tmp`. It will boot, but data disappears on every cold start, so treat that as a preview only.

## Real versus placeholder

**Real**
- **All 72 takes are real X posts.** Each was found by web search, then checked against X's public embed endpoint, twice (once when collected, once when the seed file was built). Author, handle, date, post text and link in `data/seed_takes.json` come from X's response. 64 are approved, 8 sit in the review queue so `/admin` has something to review.
- Voting, double-vote prevention, live splits, results, archive, leaderboard, share cards, admin, the learning loop and the export all work against the database and were checked in a browser, on a phone-sized screen and on desktop.

**Placeholder**
- **Every vote count is generated.** The seed script creates sample votes so that results, the leaderboard, the learning loop and the export have something to show. The site footer and the top of `output/weekly.md` say so while any exist. **Do not publish the committed `output/weekly.md`**; its splits are not real. Before launch, run `npm run seed:clear-votes`, or seed production with `--no-votes`.
- **The "what splits people" patterns are learned from those generated votes**, so they mean nothing yet. The mechanism is tested; the conclusions are not.
- **The domain.** `.here` is not a top-level domain that can be registered, so "gtmtakes.here" is used as the name on the site and cards. You need a real domain for `NEXT_PUBLIC_SITE_URL`.

## Not verified here

- **X API fetch.** There is no `X_BEARER_TOKEN` in this environment, so `fetchFromX` (v2 recent search, one query per topic) has never run against the live API. Expect to tune the queries in `lib/pipeline.ts` (`TOPIC_QUERIES`). Recent search also needs a paid X API tier.
- **Live LLM call.** No `ANTHROPIC_API_KEY` here. The review step is tested with a stubbed client, not against the API. The seed statements were written by Claude during the build instead.
- **Postgres on a real server and a real Vercel deploy.** The Postgres path is tested against PGlite (Postgres compiled to WASM), and `next build` passes. Nothing was deployed.

## Please review

1. **The 72 rewritten statements** in `data/seed_takes.json`. They put short neutral words in front of real people's names. 43 of the source posts are long-form and X only returned the first ~280 characters (`"truncated": true`), so those rewrites are based on the opening of the post. Worth a read of each against its link before launch, especially these, where the rewrite took the most judgment:
   - @timsoulo: posed as a question about Clay's valuation versus Claude Code; restated as "It's fair to question Clay's $5B valuation now that Claude Code exists."
   - @aakashgupta: relays Benioff's "per-seat SaaS is dead" and adds his own point about the market.
   - @dzhng: "I've met zero enterprise sales leader who's gotten anything out of AI SDRs" became a general statement.
   - @lennysan: item 4 of a thread, not a standalone post.
2. **Takes about Clay.** Six approved takes are about your employer, several of them critical (pricing, valuation, hype). They are real posts and fit the brief, but you should decide whether you want them on a site with your name near it.
3. **Using people's posts.** Takes are paraphrased, credited and linked, and the full original text is stored only for the admin review screen. Consider whether you want an opt-out route for authors.
4. **Vote integrity is "obvious abuse only"**, as asked. A cookie plus a 5-per-IP cap per take will not stop a determined person with a VPN. The IP comes from `x-forwarded-for`, which Vercel sets; behind another proxy, check that header is trustworthy.
5. **Model choice for the LLM step** defaults to `claude-opus-5-5`. For a nightly batch of short posts a smaller model would be much cheaper; set `TAKES_MODEL` if you want that.
6. **The "most divisive" pick weights by vote count** (LOG.md, item 10). With few votes per take it will not always be the literal closest to 50/50.

## Where things are

- `lib/scoring.ts`: splits, divisiveness, phrasing features, the learning model, lineup picking (pure functions)
- `lib/votes.ts`: vote rules. `lib/takes.ts`: queries, scheduling. `lib/export.ts`: weekly export
- `lib/pipeline.ts` + `scripts/fetch_takes.ts`: X fetch, CSV import, LLM review
- `lib/db.ts` + `lib/schema.ts`: SQLite/Postgres adapter and tables
- `components/VoteDeck.tsx`: the swipe deck. `app/api/card/[id]/route.tsx`: share card
- `LOG.md`: 19 decisions with reasons. `PLAN.md`: milestones
