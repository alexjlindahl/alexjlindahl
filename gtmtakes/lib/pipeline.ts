/**
 * Take pipeline: collect candidate posts (X API or CSV), run the LLM review
 * step (keep real opinions, rewrite neutrally), and store them as candidates
 * for /admin.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getDb } from "./db";
import { TOPICS } from "./scoring";

export interface RawPost {
  source_id: string;
  source_url: string;
  author_handle: string;
  author_name?: string;
  posted_at?: string;
  original_text: string;
  /** hint from the search query or CSV; the LLM may correct it */
  topic?: string;
  /** optional pre-written statement (CSV column), skips the LLM rewrite */
  statement?: string;
}

export interface Reviewed extends RawPost {
  keep: boolean;
  statement: string;
  topic: string;
  debate_score: number | null;
  reason: string;
  model: string;
}

// --- sources ---------------------------------------------------------------

export const TOPIC_QUERIES: Record<string, string> = {
  outbound: '("cold email" OR "cold calling" OR "cold call" OR outbound)',
  "gtm-engineering": '("GTM engineering" OR "GTM engineer" OR "go-to-market engineer")',
  clay: '(@clay_gtm OR "Clay credits" OR "Clay table" OR "Clay workflow" OR "Clay pricing")',
  "ai-sdr": '("AI SDR" OR "AI SDRs" OR "AI BDR")',
  "sales-hiring": '("hiring SDRs" OR "hiring AEs" OR "first sales hire" OR "VP of Sales" OR "sales comp" OR "SDR role")',
  plg: '(PLG OR "product-led growth" OR freemium)',
  pricing: '("SaaS pricing" OR "seat-based pricing" OR "usage-based pricing" OR "outcome-based pricing")',
};

/** Recent-search against the X API v2. Needs a bearer token with search access. */
export async function fetchFromX(bearer: string, opts: { topics?: string[]; perTopic?: number } = {}): Promise<RawPost[]> {
  const out: RawPost[] = [];
  for (const topic of opts.topics ?? Object.keys(TOPIC_QUERIES)) {
    const params = new URLSearchParams({
      query: `${TOPIC_QUERIES[topic]} lang:en -is:retweet -is:reply -has:links`,
      max_results: String(Math.min(100, Math.max(10, opts.perTopic ?? 50))),
      sort_order: "relevancy",
      "tweet.fields": "created_at,public_metrics,note_tweet",
      expansions: "author_id",
      "user.fields": "username,name",
    });
    const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${bearer}` } });
    if (!res.ok) throw new Error(`X API ${res.status} for topic "${topic}": ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as {
      data?: { id: string; text: string; author_id: string; created_at?: string; note_tweet?: { text?: string } }[];
      includes?: { users?: { id: string; username: string; name: string }[] };
    };
    const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u]));
    for (const t of body.data ?? []) {
      const u = users.get(t.author_id);
      if (!u) continue;
      out.push({
        source_id: t.id,
        source_url: `https://x.com/${u.username}/status/${t.id}`,
        author_handle: u.username,
        author_name: u.name,
        posted_at: t.created_at,
        original_text: t.note_tweet?.text ?? t.text,
        topic,
      });
    }
  }
  return out;
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function parsePostUrl(url: string): { id: string; handle: string } | null {
  const m = url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status(?:es)?\/(\d+)/);
  return m ? { handle: m[1], id: m[2] } : null;
}

/**
 * Looks a post up on X's public embed endpoint (the one embedded posts use; no
 * API key). Returns null if the post does not exist. Long posts come back
 * truncated to roughly the first 280 characters.
 */
export async function hydrateFromEmbed(id: string): Promise<Pick<RawPost, "author_handle" | "author_name" | "posted_at" | "original_text"> | null> {
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`);
  if (!res.ok) return null;
  const t = (await res.json().catch(() => null)) as { __typename?: string; text?: string; created_at?: string; user?: { screen_name: string; name: string } } | null;
  if (!t || t.__typename !== "Tweet" || !t.text || !t.user) return null;
  return { author_handle: t.user.screen_name, author_name: t.user.name, posted_at: t.created_at, original_text: t.text };
}

/**
 * CSV import. Columns (header row required): `url` (required), and optionally
 * `text`, `handle`, `name`, `posted_at`, `topic`, `statement`.
 * When `text` is empty the post is looked up from its URL.
 */
export async function fromCsv(text: string, opts: { hydrate?: boolean } = {}): Promise<{ posts: RawPost[]; skipped: string[] }> {
  const posts: RawPost[] = [];
  const skipped: string[] = [];
  for (const r of parseCsv(text)) {
    const ref = parsePostUrl(r.url ?? "");
    if (!ref) {
      skipped.push(`${r.url || "(no url)"}: not an x.com status URL`);
      continue;
    }
    let post: RawPost = {
      source_id: ref.id,
      source_url: `https://x.com/${r.handle?.replace(/^@/, "") || ref.handle}/status/${ref.id}`,
      author_handle: r.handle?.replace(/^@/, "") || ref.handle,
      author_name: r.name || undefined,
      posted_at: r.posted_at || undefined,
      original_text: r.text ?? "",
      topic: r.topic || undefined,
      statement: r.statement || undefined,
    };
    if (!post.original_text) {
      const live = opts.hydrate === false ? null : await hydrateFromEmbed(ref.id);
      if (!live) {
        skipped.push(`${r.url}: no text in the CSV and the post could not be looked up`);
        continue;
      }
      post = { ...post, ...live, source_url: `https://x.com/${live.author_handle}/status/${ref.id}` };
    }
    posts.push(post);
  }
  return { posts, skipped };
}

// --- review step -----------------------------------------------------------

const PROMO = /\b(sign up|signup|register now|join (us|our)|webinar|we're hiring|we are hiring|apply (now|here)|link in bio|use code|% off|giveaway|dm me|book a (call|demo)|launching today|just launched|now live|waitlist)\b/i;
const OPINION = /\b(is|are|isn't|aren't|should|shouldn't|will|won't|never|always|dead|overrated|underrated|mistake|wrong|best|worst|hot take|unpopular opinion|nobody|everyone|stop|don't)\b/i;

/**
 * Fallback when no ANTHROPIC_API_KEY is set. It can filter obvious promos and
 * non-opinions, but it cannot rewrite: the statement is the post's first
 * sentence and must be edited in /admin before approval.
 */
export function heuristicReview(p: RawPost): Reviewed {
  const text = p.original_text.replace(/https?:\/\/\S+/g, "").trim();
  const first = (text.split(/\n+|(?<=[.!?])\s+/)[0] ?? "").trim();
  let reason = "";
  if (text.length < 25) reason = "too short to be a take";
  else if (PROMO.test(text)) reason = "looks promotional";
  else if (text.endsWith("?") && !/[.!]/.test(text)) reason = "a question, not an opinion";
  else if (!OPINION.test(text)) reason = "no opinion language found";
  return {
    ...p,
    keep: !reason,
    statement: p.statement || first.slice(0, 200),
    topic: p.topic && (TOPICS as readonly string[]).includes(p.topic) ? p.topic : guessTopic(text),
    debate_score: null,
    reason: reason || (p.statement ? "statement supplied in CSV" : "heuristic pass: statement is the raw first sentence, rewrite before approving"),
    model: p.statement ? "csv" : "heuristic",
  };
}

export function guessTopic(text: string): string {
  const t = text.toLowerCase();
  if (/\bclay\b/.test(t)) return "clay";
  if (/ai (sdr|bdr)/.test(t)) return "ai-sdr";
  if (/gtm engineer/.test(t)) return "gtm-engineering";
  if (/\bplg\b|product-led|freemium|free plan|free trial/.test(t)) return "plg";
  if (/pricing|price|discount|per-seat|seat-based|usage-based/.test(t)) return "pricing";
  if (/hir(e|ing)|comp plan|quota|ote\b|vp of sales|first sales/.test(t)) return "sales-hiring";
  return "outbound";
}

const ReviewSchema = z.object({
  reviews: z.array(
    z.object({
      index: z.number().int(),
      is_opinion: z.boolean(),
      topic: z.enum(TOPICS),
      statement: z.string(),
      debate_score: z.number(),
      reason: z.string(),
    }),
  ),
});

export const REVIEW_SYSTEM = `You curate takes for gtmtakes.here, a daily "Hot or Not" vote where B2B go-to-market people agree or disagree with opinions posted on X.

For each post decide whether it is a real opinion that readers can agree or disagree with. Reject news, product announcements, promotion, job ads, pure how-to advice, questions, jokes with no claim, and posts whose claim cannot be understood without the rest of a thread.

For posts you keep, write a statement that:
- restates the author's claim faithfully. Do not sharpen, soften or extend it, and do not add claims the post does not make.
- stands alone as one sentence (two short ones at most), under 140 characters where possible.
- is neutral in tone: no hype, hashtags or emoji, and no first person. Voters should react to the idea, not the author's style.
- reads naturally after "Hot or not:".

topic is the closest of the allowed values. debate_score (0 to 1) estimates how evenly a GTM audience would split: 0.5 for mildly contested, near 1 for a real 50/50 fight, near 0 for something almost everyone agrees or disagrees with. reason is one short sentence, used by the human reviewer.

Return one review per post, using the post's index.`;

const BATCH = 20;

/** LLM review. Uses ANTHROPIC_API_KEY; model defaults to claude-opus-5-5 (override with TAKES_MODEL). */
export async function llmReview(posts: RawPost[], client = new Anthropic()): Promise<Reviewed[]> {
  const model = process.env.TAKES_MODEL ?? "claude-opus-5-5";
  const out: Reviewed[] = [];
  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const listing = batch
      .map((p, j) => `<post index="${j}" author="@${p.author_handle}" topic_hint="${p.topic ?? ""}">\n${p.original_text}\n</post>`)
      .join("\n\n");
    const res = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: REVIEW_SYSTEM,
      messages: [{ role: "user", content: `Review these ${batch.length} posts.\n\n${listing}` }],
      output_config: { format: zodOutputFormat(ReviewSchema) },
    });
    const reviews = res.stop_reason === "refusal" ? [] : (res.parsed_output?.reviews ?? []);
    batch.forEach((p, j) => {
      const r = reviews.find((x) => x.index === j);
      if (!r) {
        // No verdict for this post: leave it for a human rather than guess.
        out.push({ ...heuristicReview(p), keep: true, reason: "LLM returned no review for this post; needs manual review", model: "heuristic" });
        return;
      }
      out.push({
        ...p,
        keep: r.is_opinion,
        statement: p.statement || r.statement.trim(),
        topic: r.topic,
        debate_score: Math.min(1, Math.max(0, r.debate_score)),
        reason: r.reason,
        model,
      });
    });
  }
  return out;
}

export async function review(posts: RawPost[], opts: { llm?: boolean } = {}): Promise<Reviewed[]> {
  const useLlm = opts.llm ?? !!process.env.ANTHROPIC_API_KEY;
  return useLlm ? llmReview(posts) : posts.map(heuristicReview);
}

// --- storage ---------------------------------------------------------------

/** Stores reviewed posts. Kept ones become candidates; filtered ones are stored as rejected so they are not fetched again. */
export async function saveReviewed(items: Reviewed[]): Promise<{ added: number; filtered: number; duplicates: number }> {
  const db = await getDb();
  let added = 0;
  let filtered = 0;
  let duplicates = 0;
  for (const r of items) {
    const res = await db.run(
      `INSERT INTO takes (source_id, source_url, author_handle, author_name, original_text, posted_at, statement, topic, status, debate_score, llm_reason, llm_model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (source_id) DO NOTHING`,
      [r.source_id, r.source_url, r.author_handle, r.author_name ?? null, r.original_text, r.posted_at ?? null, r.statement, r.topic, r.keep ? "candidate" : "rejected", r.debate_score, r.reason, r.model, new Date().toISOString()],
    );
    if (res.changes === 0) duplicates++;
    else if (r.keep) added++;
    else filtered++;
  }
  return { added, filtered, duplicates };
}
