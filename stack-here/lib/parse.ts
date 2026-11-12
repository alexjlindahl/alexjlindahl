import type { ParseResult, ParsedTool, Tool } from "./types";

/** Lowercase, strip accents and punctuation, collapse to single spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const compact = (s: string) => s.replace(/ /g, "");

const SUFFIXES = ["io", "ai", "com", "co", "app", "hq", "inc"];
const STOPWORDS = new Set([
  "and", "the", "we", "use", "using", "for", "with", "plus", "also", "our", "is", "a", "an", "to", "of", "in",
  "on", "as", "then", "some", "stack", "tools", "tool", "etc", "i", "my", "by", "at", "or", "from", "it",
]);

/** Damerau-Levenshtein distance (adjacent transpositions count as one edit), with an early exit. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[cols - 1];
}

function allowedDistance(len: number): number {
  if (len < 5) return 0;
  if (len < 8) return 1;
  return 2;
}

export interface Matcher {
  parse(text: string): ParseResult;
  match(name: string): { toolId: string; method: "exact" | "fuzzy" } | null;
}

export function createMatcher(tools: Pick<Tool, "id" | "name" | "aliases">[]): Matcher {
  // key (compact form) -> tool id. Explicit names and aliases win over derived keys.
  const exact = new Map<string, string>();
  const derived = new Map<string, string>();

  for (const t of tools) {
    for (const raw of [t.name, t.id, ...t.aliases]) {
      const key = compact(normalize(raw));
      if (key && !exact.has(key)) exact.set(key, t.id);
    }
  }
  for (const t of tools) {
    for (const raw of [t.name, ...t.aliases]) {
      const words = normalize(raw).split(" ");
      if (words.length > 1 && SUFFIXES.includes(words[words.length - 1])) {
        const key = words.slice(0, -1).join("");
        if (key.length >= 3 && !exact.has(key) && !derived.has(key)) derived.set(key, t.id);
      }
    }
  }
  const lookup = (key: string) => exact.get(key) ?? derived.get(key);
  // Tie-break for equally close typo matches: the tool listed earlier in the database wins
  // ("salesforse" is Salesforce, not Salesforge).
  const rank = new Map(tools.map((t, i) => [t.id, i]));
  const fuzzyKeys = [...exact.keys(), ...derived.keys()].filter((k) => k.length >= 4);

  function matchExact(norm: string): string | undefined {
    if (!norm) return undefined;
    const key = compact(norm);
    const hit = lookup(key);
    if (hit) return hit;
    const words = norm.split(" ");
    if (words.length > 1 && SUFFIXES.includes(words[words.length - 1])) {
      return lookup(words.slice(0, -1).join(""));
    }
    return undefined;
  }

  function matchFuzzy(norm: string): string | undefined {
    const key = compact(norm);
    const max = allowedDistance(key.length);
    if (max === 0) return undefined;
    let best: string | undefined;
    let bestDist = max + 1;
    for (const k of fuzzyKeys) {
      if (k[0] !== key[0]) continue;
      // Short database keys only tolerate what their own length allows.
      const limit = Math.min(max, allowedDistance(k.length));
      if (limit === 0) continue;
      const d = editDistance(key, k, limit);
      if (d > limit) continue;
      const id = lookup(k)!;
      if (d < bestDist || (d === bestDist && best !== undefined && rank.get(id)! < rank.get(best)!)) {
        best = id;
        bestDist = d;
      }
    }
    return best;
  }

  function match(name: string) {
    const norm = normalize(name);
    const e = matchExact(norm);
    if (e) return { toolId: e, method: "exact" as const };
    const f = matchFuzzy(norm);
    if (f) return { toolId: f, method: "fuzzy" as const };
    return null;
  }

  const SEAT_PATTERNS = [
    /^(.+?)\s*[:\-–—]\s*(\d{1,5})\s*(?:seats?|users?|licen[sc]es?|reps?)?$/i,
    /^(.+?)\s*\(\s*(\d{1,5})\s*(?:seats?|users?|licen[sc]es?|reps?)?\s*\)$/i,
    /^(.+?)\s+[x×]\s?(\d{1,5})$/i,
    /^(.+?)\s+(\d{1,5})\s*(?:seats?|users?|licen[sc]es?|reps?)$/i,
  ];

  function parse(text: string): ParseResult {
    const matched: ParsedTool[] = [];
    const unknown: string[] = [];
    const seen = new Set<string>();

    const add = (toolId: string, input: string, method: "exact" | "fuzzy", seats?: number) => {
      if (seen.has(toolId)) {
        if (seats) {
          const existing = matched.find((m) => m.toolId === toolId);
          if (existing && !existing.seats) existing.seats = seats;
        }
        return;
      }
      seen.add(toolId);
      matched.push({ toolId, input, method, ...(seats ? { seats } : {}) });
    };

    const segments = text
      .replace(/tl;dv/gi, "tldv")
      .split(/[,\n;|•·/]+|\s+\+\s+|\s+and\s+|\s+&\s+/i)
      .map((s) => s.replace(/^\s*(?:[-*–]|\d+[.)])\s+/, "").trim())
      .filter(Boolean);

    for (const seg of segments) {
      // 1. "Gong x10", "Outreach (15 seats)", "Apollo: 5"
      let handled = false;
      for (const re of SEAT_PATTERNS) {
        const m = seg.match(re);
        if (!m) continue;
        const hit = match(m[1]);
        const seats = parseInt(m[2], 10);
        if (hit && seats > 0) {
          add(hit.toolId, m[1].trim(), hit.method, seats);
          handled = true;
          break;
        }
      }
      if (handled) continue;

      // 2. The whole segment is a tool name.
      const whole = match(seg);
      if (whole) {
        add(whole.toolId, seg, whole.method);
        continue;
      }

      // 3. Several names in one segment ("Clay HubSpot Apollo") or a name with extra words.
      const words = normalize(seg).split(" ").filter(Boolean);
      let found = 0;
      const leftovers: string[] = [];
      for (let i = 0; i < words.length; ) {
        let step = 0;
        for (let n = Math.min(4, words.length - i); n >= 1; n--) {
          const phrase = words.slice(i, i + n).join(" ");
          if (n === 1 && STOPWORDS.has(phrase)) break;
          const id = matchExact(phrase);
          if (id) {
            add(id, phrase, "exact");
            found++;
            step = n;
            break;
          }
        }
        if (!step) {
          const w = words[i];
          // Only guess at typos in short segments; in a sentence it would misfire.
          const f = words.length <= 3 && !STOPWORDS.has(w) ? matchFuzzy(w) : undefined;
          if (f) {
            add(f, w, "fuzzy");
            found++;
          } else if (!STOPWORDS.has(w)) {
            leftovers.push(w);
          }
          step = 1;
        }
        i += step;
      }
      if (!found && leftovers.length && words.length <= 4) unknown.push(seg.slice(0, 40));
    }

    return { matched, unknown: [...new Set(unknown)] };
  }

  return { parse, match };
}
