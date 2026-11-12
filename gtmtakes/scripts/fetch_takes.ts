/**
 * Pull candidate GTM takes and queue them for review in /admin.
 *
 *   npm run fetch-takes                       # X API (needs X_BEARER_TOKEN in .env)
 *   npm run fetch-takes -- --csv posts.csv    # manual import
 *   npm run fetch-takes -- --topics clay,plg --per-topic 30
 *   npm run fetch-takes -- --csv posts.csv --no-llm --dry-run
 *
 * CSV columns: url (required), text, handle, name, posted_at, topic, statement.
 * If `text` is empty the post is looked up from its URL.
 */
import "./_env";
import { readFileSync } from "node:fs";
import { getDb } from "@/lib/db";
import { fetchFromX, fromCsv, review, saveReviewed, type RawPost } from "@/lib/pipeline";

function flag(name: string): string | boolean | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

async function main() {
  const csv = flag("csv");
  const dry = !!flag("dry-run");
  let posts: RawPost[] = [];

  if (typeof csv === "string") {
    const r = await fromCsv(readFileSync(csv, "utf8"));
    posts = r.posts;
    for (const s of r.skipped) console.warn(`skipped ${s}`);
    console.log(`Read ${posts.length} posts from ${csv}`);
  } else if (process.env.X_BEARER_TOKEN) {
    const topics = typeof flag("topics") === "string" ? String(flag("topics")).split(",") : undefined;
    posts = await fetchFromX(process.env.X_BEARER_TOKEN, { topics, perTopic: Number(flag("per-topic")) || undefined });
    console.log(`Fetched ${posts.length} posts from the X API`);
  } else {
    console.error("No X_BEARER_TOKEN in .env. Either add one, or import posts by hand:\n  npm run fetch-takes -- --csv data/import_example.csv");
    process.exit(1);
  }

  // Drop posts we already have before paying for the LLM step.
  const db = await getDb();
  const known = new Set((await db.all<{ source_id: string }>("SELECT source_id FROM takes")).map((r) => r.source_id));
  const seen = new Set<string>();
  const fresh = posts.filter((p) => !known.has(p.source_id) && !seen.has(p.source_id) && seen.add(p.source_id));
  console.log(`${fresh.length} are new`);
  if (fresh.length === 0) return;

  const useLlm = !flag("no-llm") && !!process.env.ANTHROPIC_API_KEY;
  if (!useLlm) console.warn("LLM step skipped (no ANTHROPIC_API_KEY or --no-llm). Using the heuristic filter: statements are NOT rewritten and need editing in /admin.");
  const reviewed = await review(fresh, { llm: useLlm });

  for (const r of reviewed) console.log(`${r.keep ? "KEEP  " : "FILTER"} [${r.topic}] @${r.author_handle}: ${r.statement.slice(0, 110)}${r.keep ? "" : `  (${r.reason})`}`);
  if (dry) return console.log("Dry run: nothing saved.");
  const res = await saveReviewed(reviewed);
  console.log(`Saved ${res.added} candidates for /admin, filtered ${res.filtered}, ${res.duplicates} duplicates.`);
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
