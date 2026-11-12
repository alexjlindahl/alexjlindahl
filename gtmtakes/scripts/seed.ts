/**
 * Seeds the database with real, verified X posts (data/seed_takes.json) and
 * three sample days: the two days before today, and today.
 *
 *   npm run seed                 # takes + three days + SAMPLE votes
 *   npm run seed -- --no-votes   # takes + three days, no fake votes (use this for production)
 *   npm run seed:clear-votes     # delete all sample votes
 *
 * Sample votes are generated, not real. They are stored with source = 'seed'
 * so the site and the weekly export can label them, and so they can be removed.
 */
import "./_env";
import { readFileSync } from "node:fs";
import { getDb } from "@/lib/db";
import { addDays, today } from "@/lib/dates";
import { autoSchedule, getDay, refreshPatterns } from "@/lib/takes";

interface SeedTake {
  source_id: string;
  source_url: string;
  author_handle: string;
  author_name: string;
  posted_at: string;
  original_text: string;
  topic: string;
  statement: string;
  debate_score: number;
  status: string;
}

// Small deterministic PRNG so every seed run produces the same sample data.
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function sampleVotes(takeId: number, sourceId: string, debate: number, scale: number) {
  const db = await getDb();
  const r = rng(sourceId);
  // More debatable takes get a hot-share closer to 50%.
  const spread = 0.45 * (1.15 - debate);
  const pHot = Math.min(0.95, Math.max(0.05, 0.5 + (r() * 2 - 1) * spread));
  const pDepends = 0.04 + r() * 0.14;
  const n = Math.round((140 + r() * 320) * scale);
  const rows: unknown[][] = [];
  for (let i = 0; i < n; i++) {
    const choice = r() < pDepends ? "depends" : r() < pHot ? "hot" : "not";
    rows.push([takeId, choice, `seed-${sourceId}-${i}`, `seed-${i}`, "seed", new Date().toISOString()]);
  }
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await db.run(
      `INSERT INTO votes (take_id, choice, voter_id, ip_hash, source, created_at) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")} ON CONFLICT DO NOTHING`,
      chunk.flat(),
    );
  }
}

async function main() {
  const db = await getDb();
  if (process.argv.includes("--clear-votes")) {
    const r = await db.run("DELETE FROM votes WHERE source = 'seed'");
    await refreshPatterns();
    return console.log(`Deleted ${r.changes} sample votes.`);
  }
  const withVotes = !process.argv.includes("--no-votes");
  const takes: SeedTake[] = JSON.parse(readFileSync("data/seed_takes.json", "utf8"));
  let added = 0;
  for (const t of takes) {
    const r = await db.run(
      `INSERT INTO takes (source_id, source_url, author_handle, author_name, original_text, posted_at, statement, topic, status, debate_score, llm_reason, llm_model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source_id) DO NOTHING`,
      [t.source_id, t.source_url, t.author_handle, t.author_name, t.original_text, t.posted_at, t.statement, t.topic, t.status, t.debate_score, "Seed take: reviewed and rewritten by Claude during the build", "claude (build session)", new Date().toISOString()],
    );
    added += r.changes;
  }
  console.log(`Takes: ${added} added, ${takes.length - added} already present.`);

  const debate = new Map(takes.map((t) => [t.source_id, t.debate_score]));
  const t0 = today();
  // Oldest first, so each day is ranked using what the earlier days "learned".
  for (const [day, scale] of [[addDays(t0, -2), 1], [addDays(t0, -1), 1], [t0, 0.25]] as const) {
    const n = await autoSchedule(day);
    const lineup = await getDay(day);
    if (withVotes) {
      for (const t of lineup) if (t.counts.hot + t.counts.not + t.counts.depends === 0) await sampleVotes(t.id, t.source_id!, debate.get(t.source_id!) ?? 0.5, scale);
    }
    await refreshPatterns();
    console.log(`${day}: ${lineup.length} takes scheduled (${n} new)${withVotes ? ", sample votes added" : ""}`);
  }
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
