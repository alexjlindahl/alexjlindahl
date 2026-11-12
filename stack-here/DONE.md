# stack.here: done

A Next.js app in `stack-here/`. Paste a GTM stack, get a grade, overlap flags, a wasted-spend estimate, gaps and a
1200x630 share card at a unique URL.

## Run it

```bash
cd stack-here
npm install
npm run dev          # http://localhost:3000
npm run seed         # optional: inserts the 10 sample stacks and prints their URLs
npm test             # 35 tests: parsing, grading, learning loop, database checks
```

No `.env` is needed locally. Data goes to `.data/stack-here.db` (SQLite). Copy `.env.example` to `.env` to change that.

| Page | What it is |
| --- | --- |
| `/` | Input: text box, team size, optional seats per tool, 10 sample stacks |
| `/s/<id>` | Result page |
| `/s/<id>/card.png` | Share card, also the page's OG and Twitter image |
| `/tools` | The full tool database with prices and source links |
| `/insights` | Admin: common stacks, most-cut tools, frequent overlaps, learned rules |

## Deploy to Vercel

1. Import the repo and set **Root Directory** to `stack-here`.
2. Add a Postgres database (Neon or Vercel Postgres) and set `DATABASE_URL`. Tables are created on first request.
3. Set `ADMIN_PASSWORD` (for /insights), `CRON_SECRET` (any random string) and `NEXT_PUBLIC_SITE_URL` (e.g. `https://stack.here`).
4. Deploy. `vercel.json` schedules the rules refresh for Mondays 06:00 UTC.

Without `DATABASE_URL` the app still runs on Vercel, but SQLite lives in `/tmp` and results disappear between
cold starts. Use Postgres for anything real.

## What was checked

- `npm test`: 35 passing. `npx tsc --noEmit` and `npm run build`: clean.
- In a real browser: all 10 samples submitted through the form, each result page rendered with every section, each card
  returned a 1200x630 PNG, OG tags present, cut form saved, 404 for a bad id, no horizontal scroll at phone width.
- Production build (`next start`): insights login, cron auth (401 without the secret), API error paths, card generation.
- Postgres path: seeded and exercised against a local Postgres 16 (submissions, cuts, unknown-name counts, refresh).
- Not checked: an actual Vercel deployment, and Vercel Cron firing.

Sample grades: Seed-stage outbound A, Classic enterprise A, Mid-market balanced A, PLG motion B, AI SDR curious B,
Data hoarder C, Just a CRM C, Notetaker pile-up C, Two of everything D, Cold email shop D.

## Real versus placeholder

**Real**
- Tool database: 250 tools. 151 have a list price read from the vendor's own site on 2026-11-12, each with a source URL.
  73 are "pricing not public". No price was estimated or taken from a review site.
- Parsing, grading, overlaps, gaps, spend estimate, share card, unique URLs, storage, the cut button, /insights,
  the refresh job.

**Placeholder or thin**
- **Grading weights are my judgment**, not derived from data. They are in `lib/taxonomy.ts` (job weights, which jobs
  are core) and `lib/grade.ts` (thresholds).
- **The learning loop has no data yet.** It adjusts overlap weights and adds cut-rate penalties only past minimum
  sample sizes, so until real submissions and cut reports arrive, grades use the base rules.
- **Roast lines** are about 25 templates picked by rule, not generated.
- **26 prices are "unverified"**: the vendor page blocked automated reading or renders prices with JavaScript.
  They show as "pricing not verified" and are excluded from spend numbers.
- No rate limiting or bot protection on the submit and cut endpoints.
- `stack.here` is only a name on the page; `.here` is not a domain you can register as far as I know.

## For you to review

1. **Grades feel right?** Open the 10 samples. "Classic enterprise" gets an A because it has one tool per job; you may
   want cost or complexity to weigh more. The brief's own example (Clay, HubSpot, Apollo, Outreach, Gong) gets an A (92).
2. **Spend method.** Per-seat tools are multiplied by team size unless seats are given, at the *lowest paid plan*.
   That understates enterprise contracts and can overstate seat counts (not everyone has an Apollo seat). The page says
   so, but check you are comfortable with the framing.
3. **Prices that rest on a judgment call** (all noted in each entry's `pricing.note`):
   - HubSpot Sales Hub and Marketing Hub Starter: recorded at $20/seat/month; the page also shows $7, which may be
     the annual rate rather than a promo.
   - Chili Piper: recorded as the $1,250/month Growth plan, not ChiliCal at $12/user (200-seat minimum).
   - Annual-only prices divided by 12: Lusha, People Data Labs, Sales Navigator, BuiltWith, Adapt.io, Warmly, UserGems,
     Vector, Openprise, Default, Trumpet, Loom, Sendspark, Crossbeam, Cloudingo, Reachdesk, Dropbox Sign.
   - Surprisingly low, taken as shown: Unify $20/seat/month, Mutiny $50/month, Tray.ai $50/month (Helix Builder only).
   - Amplitude, Mixpanel, PostHog: "starts at $0" usage pricing, stored as 0 and excluded from spend.
   - Priced in EUR and excluded from spend: Dropcontact, La Growth Machine, Waalaxy, CloudTalk, Leadfeeder, Albacross,
     tl;dv, n8n, Livestorm.
4. **Unverified prices to fill in by hand:** RocketReach, Seamless.AI, Clearbit, ContactOut, Lead411, Datanyze, Prospeo,
   Crunchbase, Ocean.io, NeverBounce, PhantomBuster, Pipedrive, Zoho CRM, Marketo Engage, ActiveCampaign, Reply.io,
   Woodpecker, Keyplay, Grain, Make, Segment, Tableau, Marketo Measure, Aligned, Navattic, ON24.
   Edit the entry in `data/parts/*.json`, then `npm run build:tools`.
5. **Renames and shutdowns found during research** (kept so old names still match): Dooly (shut down), Koala (shutting
   down), Trigify (wound down), Pocus (joining Apollo), Drift (now 1mind), People.ai (now Backstory), BoostUp (now
   Terret), Totango (now Odie), RollWorks (now AdRoll ABM), Terminus (DemandScience), Census (Fivetran), Clari and
   Groove (site redirects to Salesloft). Two of these are inferred from redirects only: BoostUp/Terret and
   Clari/Salesloft.
6. **Job tags** on each tool drive every overlap. They came from model knowledge, not vendor pages. Skim `/tools` for
   anything miscategorized.
7. **Privacy wording.** The footer says only tools are stored. True for submissions; the optional cut note is free
   text with emails, URLs and phone numbers stripped.

Decisions are in `LOG.md`; progress and next steps are in `PLAN.md`.
