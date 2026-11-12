import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { fromCsv, heuristicReview, llmReview, parseCsv, parsePostUrl, saveReviewed, type RawPost } from "@/lib/pipeline";
import { listByStatus } from "@/lib/takes";
import { freshDb } from "./helpers";

const post = (over: Partial<RawPost> = {}): RawPost => ({
  source_id: "111",
  source_url: "https://x.com/someone/status/111",
  author_handle: "someone",
  original_text: "Cold calling is dead and everyone still pretending otherwise is wasting their team's time.",
  ...over,
});

describe("csv import", () => {
  it("parses quoted fields, embedded commas, quotes and newlines", () => {
    const rows = parseCsv('url,text,topic\r\nhttps://x.com/a/status/1,"Hello, ""world""\nline two",plg\n\nhttps://x.com/b/status/2,plain,\n');
    expect(rows).toEqual([
      { url: "https://x.com/a/status/1", text: 'Hello, "world"\nline two', topic: "plg" },
      { url: "https://x.com/b/status/2", text: "plain", topic: "" },
    ]);
  });
  it("reads handle and id from x.com and twitter.com URLs", () => {
    expect(parsePostUrl("https://twitter.com/jack/status/20?s=20")).toEqual({ handle: "jack", id: "20" });
    expect(parsePostUrl("https://x.com/a_b/status/123")).toEqual({ handle: "a_b", id: "123" });
    expect(parsePostUrl("https://example.com/nope")).toBeNull();
  });
  it("builds posts and reports rows it cannot use", async () => {
    const { posts, skipped } = await fromCsv("url,text,statement\nhttps://x.com/a/status/1,Some opinion text,My statement\nnot-a-url,x,\nhttps://x.com/b/status/2,,\n", { hydrate: false });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ source_id: "1", author_handle: "a", statement: "My statement" });
    expect(skipped).toHaveLength(2);
  });
});

describe("heuristic review (no API key)", () => {
  it("keeps opinions and filters promos, questions and fragments", () => {
    expect(heuristicReview(post()).keep).toBe(true);
    expect(heuristicReview(post({ original_text: "We just launched our new AI SDR! Sign up for the webinar today" })).keep).toBe(false);
    expect(heuristicReview(post({ original_text: "What tools does your team use for outbound these days?" })).keep).toBe(false);
    expect(heuristicReview(post({ original_text: "lol" })).keep).toBe(false);
  });
  it("guesses a topic and flags that the statement still needs a rewrite", () => {
    const r = heuristicReview(post({ original_text: "Clay credits are overpriced. Teams should stop buying them." }));
    expect(r.topic).toBe("clay");
    expect(r.statement).toBe("Clay credits are overpriced.");
    expect(r.reason).toMatch(/rewrite before approving/);
    expect(r.debate_score).toBeNull();
  });
});

describe("llm review", () => {
  const fake = (reviews: unknown[], stop_reason = "end_turn") => {
    const calls: { system: string; messages: { content: string }[]; model: string }[] = [];
    const client = { messages: { parse: async (req: (typeof calls)[number]) => (calls.push(req), { stop_reason, parsed_output: { reviews } }) } };
    return { client: client as unknown as Anthropic, calls };
  };

  it("maps model verdicts onto posts and sends the post text and author", async () => {
    const { client, calls } = fake([
      { index: 0, is_opinion: true, topic: "outbound", statement: " Cold calling is dead. ", debate_score: 1.4, reason: "clear claim" },
      { index: 1, is_opinion: false, topic: "plg", statement: "", debate_score: 0, reason: "product announcement" },
    ]);
    const out = await llmReview([post(), post({ source_id: "222", original_text: "We shipped a free tier today." })], client);
    expect(out[0]).toMatchObject({ keep: true, statement: "Cold calling is dead.", topic: "outbound", debate_score: 1, reason: "clear claim" });
    expect(out[1]).toMatchObject({ keep: false, reason: "product announcement" });
    expect(calls[0].messages[0].content).toContain("Cold calling is dead and everyone");
    expect(calls[0].messages[0].content).toContain('author="@someone"');
    expect(calls[0].system).toContain("restates the author's claim faithfully");
  });

  it("sends a post to manual review instead of guessing when the model returns nothing for it", async () => {
    const out = await llmReview([post()], fake([], "refusal").client);
    expect(out[0]).toMatchObject({ keep: true, model: "heuristic" });
    expect(out[0].reason).toMatch(/manual review/);
  });
});

describe("saving candidates", () => {
  beforeEach(async () => {
    await freshDb();
  });
  it("queues kept posts, records filtered ones as rejected, and skips duplicates", async () => {
    const kept = heuristicReview(post());
    const promo = heuristicReview(post({ source_id: "333", original_text: "Join our webinar on outbound, register now, it is the best" }));
    expect(await saveReviewed([kept, promo])).toEqual({ added: 1, filtered: 1, duplicates: 0 });
    expect(await saveReviewed([kept])).toEqual({ added: 0, filtered: 0, duplicates: 1 });
    expect((await listByStatus("candidate")).map((t) => t.source_id)).toEqual(["111"]);
    expect((await listByStatus("rejected")).map((t) => t.source_id)).toEqual(["333"]);
  });
});
