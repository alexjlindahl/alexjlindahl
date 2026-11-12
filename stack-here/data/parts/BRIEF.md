# Research brief: GTM tool database batch

You are building one batch of a database of go-to-market (sales/marketing/revops) software tools.
Read `/workspace/alexjlindahl/stack-here/data/SCHEMA.md` first: it defines the exact JSON shape, the allowed
`category` values, the allowed `jobs` ids, and the strict pricing rules. Follow it exactly.

For every tool in your list:
1. Fetch the vendor's own pricing page (WebFetch; try /pricing, or WebSearch "<tool> pricing" restricted to the vendor's
   domain to find it). If WebFetch returns a JS shell with no prices, try `curl -sL <url>` via Bash and grep the HTML
   for "$" amounts; some pages embed prices in JSON.
2. Record the lowest-priced PAID plan exactly as the vendor's page shows it (prefer the annual-billing monthly-equivalent
   when both terms are shown; say which in `billing`). `unit` is "seat/month" when priced per user, "month" when it is a
   flat or usage/credit plan. If only an annual figure is shown, divide by 12 and say so in `note`.
3. If the page says contact sales / get a quote / there is no pricing page: status "not_public", amount null,
   note "pricing not public".
4. If you could not read the page after two honest attempts: status "unverified", amount null, note "pricing not verified".
   Do not spend more than ~3 tool calls on any one tool.
5. NEVER write a price from memory, from a review site (G2, Capterra, Vendr, blogs), or as an estimate. A wrong price is
   much worse than a null. The `sourceUrl` must be the vendor page where you actually saw the number.
6. Fill name, aliases (lowercase; include obvious short forms, former names, common typos, e.g. "zoom info", "sales nav"),
   category, jobs, bestAt, website from your own knowledge — but if a product has been renamed, acquired or shut down and
   you notice that while researching, reflect it (keep the old name as an alias, mention it in pricing.note).
7. `checkedOn` is "2026-11-12".

If a tool on your list no longer exists as a product, still include it if people would plausibly still type its name
(old name in aliases), otherwise drop it and say so in your final report.

Output: write a single valid JSON array to the output path given below (pretty-printed, 2-space indent). Validate it
with `node -e "JSON.parse(require('fs').readFileSync('<path>','utf8'))"` and check that every `category` and every
`jobs` id is in the allowed lists. Do not write any other files and do not touch git.

Final report (short): count of entries, count by pricing status, and any tools you dropped or renamed.
