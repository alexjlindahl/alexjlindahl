/**
 * Pure scoring + learning functions. No database access here so everything is
 * easy to test and to reason about.
 */

export type Choice = "hot" | "not" | "depends";
export const CHOICES: Choice[] = ["hot", "not", "depends"];

export interface Counts {
  hot: number;
  not: number;
  depends: number;
}

export const TOPICS = ["outbound", "gtm-engineering", "clay", "ai-sdr", "sales-hiring", "plg", "pricing"] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<string, string> = {
  outbound: "Outbound",
  "gtm-engineering": "GTM Engineering",
  clay: "Clay",
  "ai-sdr": "AI SDRs",
  "sales-hiring": "Sales Hiring",
  plg: "PLG",
  pricing: "Pricing",
};

export interface Split {
  total: number;
  /** hot + not ("it depends" voters sit out the split) */
  decided: number;
  hotPct: number;
  notPct: number;
  /** share of all voters who said "it depends" */
  dependsPct: number;
}

export function split(c: Counts): Split {
  const decided = c.hot + c.not;
  const total = decided + c.depends;
  const hotPct = decided === 0 ? 0 : Math.round((c.hot / decided) * 100);
  return {
    total,
    decided,
    hotPct,
    notPct: decided === 0 ? 0 : 100 - hotPct,
    dependsPct: total === 0 ? 0 : Math.round((c.depends / total) * 100),
  };
}

/** 1 = a perfect 50/50 split, 0 = unanimous (or no votes). */
export function divisiveness(c: Counts): number {
  const decided = c.hot + c.not;
  if (decided === 0) return 0;
  return 1 - Math.abs(c.hot - c.not) / decided;
}

/** How much to trust a split with `decided` votes: 0 with no votes, 0.5 at k votes, -> 1. */
export function confidence(decided: number, k = 20): number {
  return decided / (decided + k);
}

/**
 * The ranking score for "most divisive". Raw divisiveness shrunk by vote
 * count, so a 1-1 tie does not outrank a 240-260 split.
 */
export function controversyScore(c: Counts, k = 20): number {
  return divisiveness(c) * confidence(c.hot + c.not, k);
}

/** Wilson lower bound for a proportion: "at least this share agree", robust to small samples. */
export function wilsonLower(successes: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = successes / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

export interface Scored {
  counts: Counts;
}

/** Picks the three headline takes for a results page. A take can only win one title. */
export function pickHeadlines<T extends Scored>(takes: T[]): { divisive?: T; agreed?: T; rejected?: T } {
  const voted = takes.filter((t) => t.counts.hot + t.counts.not > 0);
  const by = (f: (t: T) => number) => [...voted].sort((a, b) => f(b) - f(a));
  const divisive = by((t) => controversyScore(t.counts))[0];
  const agreed = by((t) => wilsonLower(t.counts.hot, t.counts.hot + t.counts.not)).find((t) => t !== divisive && t.counts.hot > t.counts.not);
  const rejected = by((t) => wilsonLower(t.counts.not, t.counts.hot + t.counts.not)).find((t) => t !== divisive && t !== agreed && t.counts.not > t.counts.hot);
  return { divisive, agreed, rejected };
}

// ---------------------------------------------------------------------------
// Phrasing features
// ---------------------------------------------------------------------------

const PHRASING: Record<string, RegExp> = {
  absolute: /\b(always|never|dead|dying|every|everyone|all|none|no one|nobody|only|nothing|impossible|is over|zero)\b/i,
  comparative: /\b(better than|worse than|beats?|more than|less than|outperforms?|vs\.?|versus|instead of|rather than|over)\b/i,
  prediction: /\b(will|won't|going to|by 20\d\d|within \d+|in \d+ (years?|months?)|soon|eventually|replace[sd]?)\b/i,
  prescriptive: /\b(should|shouldn't|must|need to|needs to|have to|stop|don't|do not|ought)\b/i,
  negative: /\b(not|no|never|don't|doesn't|isn't|aren't|can't|won't|dead|fails?|broken|waste|overrated|useless|worse|bad|wrong|mistake)\b/i,
  "names-tool": /\b(clay|apollo|zoominfo|salesforce|hubspot|outreach|salesloft|gong|linkedin|chatgpt|claude|11x|artisan|instantly|smartlead|notion|slack|figma)\b/i,
  number: /\d/,
  "role-callout": /\b(sdrs?|bdrs?|aes?|founders?|cros?|cmos?|ceos?|vps?|marketers?|reps?|salespeople|sellers?|recruiters?|rev ?ops)\b/i,
};

/** Features used by the learning loop: the take's topic plus how it is phrased. */
export function extractFeatures(statement: string, topic: string): string[] {
  const f = [`topic:${topic}`];
  for (const [name, re] of Object.entries(PHRASING)) if (re.test(statement)) f.push(`phrasing:${name}`);
  const words = statement.trim().split(/\s+/).length;
  f.push(words <= 10 ? "phrasing:short" : words >= 18 ? "phrasing:long" : "phrasing:medium");
  return f;
}

export function featureLabel(feature: string): string {
  const [kind, key] = feature.split(":");
  if (kind === "topic") return `Topic: ${TOPIC_LABELS[key] ?? key}`;
  const names: Record<string, string> = {
    absolute: "Absolute claims (always, never, dead)",
    comparative: "Comparisons (X beats Y)",
    prediction: "Predictions (will, by 2027)",
    prescriptive: "Prescriptions (should, stop)",
    negative: "Negative framing",
    "names-tool": "Names a specific tool",
    number: "Includes a number",
    "role-callout": "Calls out a role (SDRs, founders)",
    short: "Short (10 words or fewer)",
    medium: "Medium length",
    long: "Long (18+ words)",
  };
  return names[key] ?? key;
}

// ---------------------------------------------------------------------------
// Learning: which features predict a divisive take?
// ---------------------------------------------------------------------------

export interface Observation {
  features: string[];
  counts: Counts;
}

export interface Pattern {
  feature: string;
  nTakes: number;
  /** shrunk estimate of divisiveness for takes with this feature */
  avgDivisiveness: number;
  /** avgDivisiveness minus the global mean; positive = splits people more than usual */
  lift: number;
}

export interface Model {
  mean: number;
  nTakes: number;
  patterns: Map<string, Pattern>;
}

export const MIN_DECIDED_TO_LEARN = 5;
/** Prior strength, in "fully trusted takes". Higher = slower to believe a pattern. */
const PRIOR_WEIGHT = 2;
const DEFAULT_MEAN = 0.5;

/**
 * Fits a deliberately simple model: for each feature, the confidence-weighted
 * average divisiveness of the takes that have it, shrunk toward the global mean.
 * With a few dozen takes this is about as much as the data can support.
 */
export function learn(observations: Observation[]): Model {
  const usable = observations.filter((o) => o.counts.hot + o.counts.not >= MIN_DECIDED_TO_LEARN);
  let wSum = 0;
  let ySum = 0;
  const acc = new Map<string, { w: number; wy: number; n: number }>();
  for (const o of usable) {
    const w = confidence(o.counts.hot + o.counts.not);
    const y = divisiveness(o.counts);
    wSum += w;
    ySum += w * y;
    for (const f of o.features) {
      const a = acc.get(f) ?? { w: 0, wy: 0, n: 0 };
      a.w += w;
      a.wy += w * y;
      a.n += 1;
      acc.set(f, a);
    }
  }
  const mean = wSum > 0 ? ySum / wSum : DEFAULT_MEAN;
  const patterns = new Map<string, Pattern>();
  for (const [feature, a] of acc) {
    const est = (a.wy + PRIOR_WEIGHT * mean) / (a.w + PRIOR_WEIGHT);
    patterns.set(feature, { feature, nTakes: a.n, avgDivisiveness: est, lift: est - mean });
  }
  return { mean, nTakes: usable.length, patterns };
}

export interface Prediction {
  /** expected divisiveness, 0..1 */
  predicted: number;
  /** bonus for features we have little data on, so the site keeps exploring */
  explore: number;
  /** what candidates are sorted by */
  rank: number;
}

const EXPLORE_WEIGHT = 0.08;
const DEBATE_WEIGHT = 0.15;

export function predict(model: Model, features: string[], debateScore?: number | null): Prediction {
  const lift = (f: string) => model.patterns.get(f)?.lift ?? 0;
  const topic = features.filter((f) => f.startsWith("topic:"));
  const phrasing = features.filter((f) => f.startsWith("phrasing:"));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const predicted = Math.min(1, Math.max(0, model.mean + avg(topic.map(lift)) + avg(phrasing.map(lift))));
  const explore = EXPLORE_WEIGHT * avg(features.map((f) => 1 / Math.sqrt(1 + (model.patterns.get(f)?.nTakes ?? 0))));
  const prior = debateScore == null ? 0 : DEBATE_WEIGHT * (debateScore - 0.5);
  return { predicted, explore, rank: predicted + explore + prior };
}

export interface Rankable {
  id: number;
  topic: string;
  author_handle: string;
  rank: number;
}

/**
 * Greedy pick of the day's lineup from candidates sorted by rank, keeping the
 * day varied: at most `maxPerTopic` per topic and one take per author. The
 * limits relax if the pool is too small to fill the day otherwise.
 */
export function pickLineup<T extends Rankable>(candidates: T[], size = 10, maxPerTopic = 3): T[] {
  const sorted = [...candidates].sort((a, b) => b.rank - a.rank || a.id - b.id);
  const picked: T[] = [];
  for (const [topicCap, authorCap] of [[maxPerTopic, 1], [maxPerTopic + 2, 2], [Infinity, Infinity]]) {
    for (const c of sorted) {
      if (picked.length >= size) break;
      if (picked.includes(c)) continue;
      const sameTopic = picked.filter((p) => p.topic === c.topic).length;
      const sameAuthor = picked.filter((p) => p.author_handle.toLowerCase() === c.author_handle.toLowerCase()).length;
      if (sameTopic < topicCap && sameAuthor < authorCap) picked.push(c);
    }
  }
  return picked;
}
