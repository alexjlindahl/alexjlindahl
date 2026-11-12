export type PricingStatus = "public" | "not_public" | "unverified";

export interface Pricing {
  status: PricingStatus;
  amount: number | null;
  currency: string | null;
  unit: "seat/month" | "month" | null;
  plan: string | null;
  billing: "annual" | "monthly" | null;
  hasFreeTier: boolean;
  note: string;
  sourceUrl: string | null;
  checkedOn: string;
}

export interface Tool {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  jobs: string[];
  bestAt: string;
  website: string;
  pricing: Pricing;
}

export interface ParsedTool {
  toolId: string;
  input: string;
  method: "exact" | "fuzzy";
  seats?: number;
}

export interface ParseResult {
  matched: ParsedTool[];
  unknown: string[];
}

export interface OverlapFlag {
  job: string;
  jobLabel: string;
  severity: "direct" | "partial";
  tools: { id: string; primary: boolean }[];
  advice: string;
}

export interface WasteItem {
  toolId: string;
  job: string;
  annual: number;
  basis: string;
}

export interface WasteEstimate {
  low: number;
  high: number;
  items: WasteItem[];
  /** Redundant tools left out of the number, with the reason. */
  excluded: { toolId: string; reason: string }[];
  assumptions: string[];
}

export interface Gap {
  id: string;
  label: string;
  tier: "core" | "recommended";
  why: string;
  examples: string[];
}

export interface AnalysisResult {
  version: 1;
  tools: string[];
  unknown: string[];
  teamSize: number | null;
  seats: Record<string, number>;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  explanation: [string, string, string];
  overlaps: OverlapFlag[];
  waste: WasteEstimate;
  knownSpend: { annual: number; pricedTools: number; unpricedTools: number };
  gaps: Gap[];
  roast: string;
  rulesVersion: string;
}

export interface LearnedRules {
  version: string;
  generatedAt: string;
  sampleSize: { submissions: number; cuts: number };
  /** Multiplier on a job's overlap penalty, 0.7 to 1.5. */
  jobWeight: Record<string, number>;
  /** Extra score penalty (0 to 3) for tools that users report cutting unusually often. */
  toolCutPenalty: Record<string, number>;
  /** Sorted sample of past scores, used for "beats X% of stacks". */
  scores: number[];
}
