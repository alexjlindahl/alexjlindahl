import { CAPABILITIES, JOBS, jobLabel } from "./taxonomy";
import { roast } from "./roast";
import type { AnalysisResult, Gap, LearnedRules, OverlapFlag, Tool, WasteEstimate, WasteItem } from "./types";

export const DEFAULT_SEATS = 5;
export const BASE_RULES_VERSION = "base-1";

/** Data jobs where running several sources is partly deliberate if a waterfall tool is in the stack. */
const DATA_JOBS = new Set(["contact-data", "company-data", "enrichment", "email-finding", "phone-data"]);

export interface AnalyzeInput {
  toolIds: string[];
  unknown?: string[];
  teamSize?: number | null;
  seats?: Record<string, number>;
}

export interface AnalyzeContext {
  tools: Tool[];
  learned?: LearnedRules | null;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

function roundMoney(n: number): number {
  if (n <= 0) return 0;
  if (n < 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 100) * 100;
}

/** Annual list-price cost, or null when there is no public USD price to use. */
export function annualCost(tool: Tool, seats: number): { annual: number; basis: string } | null {
  const p = tool.pricing;
  if (p.status !== "public" || p.amount == null || p.amount <= 0 || p.currency !== "USD") return null;
  if (p.unit === "seat/month") {
    return { annual: p.amount * seats * 12, basis: `${fmt(p.amount)}/seat/mo × ${seats} seats × 12` };
  }
  if (p.unit === "month") {
    return { annual: p.amount * 12, basis: `${fmt(p.amount)}/mo × 12 (flat plan)` };
  }
  return null;
}

/** Lowercase a label for mid-sentence use, keeping acronyms ("CRM", "AI SDR agent" -> "AI SDR agent"). */
function inline(label: string): string {
  return label
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(" ");
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

export function gradeFor(score: number): AnalysisResult["grade"] {
  if (score >= 88) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

export function analyze(input: AnalyzeInput, ctx: AnalyzeContext): AnalysisResult {
  const byId = new Map(ctx.tools.map((t) => [t.id, t]));
  const tools = [...new Set(input.toolIds)].map((id) => byId.get(id)).filter((t): t is Tool => !!t);
  const ids = tools.map((t) => t.id);
  const name = (id: string) => byId.get(id)?.name ?? id;
  const teamSize = input.teamSize && input.teamSize > 0 ? Math.round(input.teamSize) : null;
  const seatOverrides = input.seats ?? {};
  const seatsFor = (id: string) => seatOverrides[id] ?? teamSize ?? DEFAULT_SEATS;
  const learned = ctx.learned ?? null;

  const hasWaterfall = tools.some((t) => t.jobs.includes("waterfall-enrichment") || t.jobs.includes("data-orchestration"));

  // ---- Overlaps -------------------------------------------------------------------------------
  const overlaps: OverlapFlag[] = [];
  let overlapPenalty = 0;
  let partialPenalty = 0;
  const directSets: Set<string>[] = [];

  const jobsInStack = new Map<string, Tool[]>();
  for (const t of tools) for (const j of t.jobs) jobsInStack.set(j, [...(jobsInStack.get(j) ?? []), t]);

  const pending: { job: string; members: Tool[]; primaries: Tool[] }[] = [];
  for (const [job, members] of jobsInStack) {
    const rule = JOBS[job];
    if (!rule || rule.mode !== "single" || members.length < 2) continue;
    pending.push({ job, members, primaries: members.filter((t) => t.jobs[0] === job) });
  }
  pending.sort((a, b) => b.primaries.length - a.primaries.length || (JOBS[b.job].weight - JOBS[a.job].weight));

  for (const { job, members, primaries } of pending) {
    const rule = JOBS[job];
    const flagTools = members.map((t) => ({ id: t.id, primary: t.jobs[0] === job }));
    if (primaries.length >= 2) {
      const softened = hasWaterfall && DATA_JOBS.has(job);
      const mult = (learned?.jobWeight[job] ?? 1) * (softened ? 0.5 : 1);
      overlapPenalty += rule.weight * mult * (primaries.length - 1);
      directSets.push(new Set(members.map((t) => t.id)));
      overlaps.push({
        job,
        jobLabel: rule.label,
        severity: "direct",
        tools: flagTools,
        advice: softened
          ? `A waterfall tool is in the stack, so some multi-source coverage is deliberate. Still, keep one seat-based subscription for ${inline(rule.label)} and buy the rest as credits.`
          : `${list(primaries.map((t) => t.name))} are all bought mainly for ${inline(rule.label)}. Keep the one the team logs into and cut or downgrade the rest.`,
      });
    } else if (primaries.length === 1) {
      // Skip partial flags that only restate a direct overlap between the same tools.
      if (directSets.some((s) => members.every((t) => s.has(t.id)))) continue;
      const main = primaries[0];
      const others = members.filter((t) => t.id !== main.id);
      partialPenalty += 2;
      overlaps.push({
        job,
        jobLabel: rule.label,
        severity: "partial",
        tools: flagTools,
        advice: `${list(others.map((t) => t.name))} also ${others.length > 1 ? "do" : "does"} ${inline(rule.label)} as a side feature. Check that ${main.name} is still earning its seat for it.`,
      });
    }
  }
  partialPenalty = Math.min(partialPenalty, 8);
  overlaps.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "direct" ? -1 : 1));

  // ---- Wasted spend ---------------------------------------------------------------------------
  const items: WasteItem[] = [];
  const excluded: WasteEstimate["excluded"] = [];
  for (const o of overlaps) {
    if (o.severity !== "direct") continue;
    const primaries = o.tools.filter((t) => t.primary).map((t) => byId.get(t.id)!);
    const redundant = primaries.length - 1;
    const priced: (WasteItem & { annual: number })[] = [];
    for (const t of primaries) {
      const c = annualCost(t, seatsFor(t.id));
      if (c) priced.push({ toolId: t.id, job: o.job, annual: c.annual, basis: c.basis });
      else {
        const p = t.pricing;
        const reason =
          p.status === "not_public" ? "pricing not public"
          : p.status === "unverified" ? "pricing not verified"
          : p.hasFreeTier && !p.amount ? "free plan"
          : p.currency && p.currency !== "USD" ? `priced in ${p.currency}`
          : "no per-seat or per-plan list price";
        excluded.push({ toolId: t.id, reason });
      }
    }
    // Assume the tool you keep is the most expensive one (or one without a public price).
    priced.sort((a, b) => a.annual - b.annual);
    items.push(...priced.slice(0, Math.min(redundant, priced.length)));
  }
  const rawHigh = items.reduce((s, i) => s + i.annual, 0);
  const anySeatDefault = items.some((i) => seatOverrides[i.toolId] == null && teamSize == null && byId.get(i.toolId)!.pricing.unit === "seat/month");
  const assumptions = [
    "Uses the lowest paid plan on each vendor's public pricing page. Your contract is probably different.",
    "High end: you keep one tool per overlapping job and cut the rest. Low end: only half of that is recoverable.",
    "Partial overlaps (a side feature duplicating another tool) are flagged but not counted.",
  ];
  if (anySeatDefault) assumptions.push(`No team size given, so per-seat tools are counted at ${DEFAULT_SEATS} seats.`);
  if (excluded.length) assumptions.push("Overlapping tools without a usable public price are left out, so the real number may be higher.");
  const waste: WasteEstimate = {
    low: roundMoney(rawHigh * 0.5),
    high: roundMoney(rawHigh),
    items,
    excluded,
    assumptions,
  };

  // ---- Known spend ----------------------------------------------------------------------------
  let knownAnnual = 0;
  let pricedTools = 0;
  for (const t of tools) {
    const c = annualCost(t, seatsFor(t.id));
    if (c) {
      knownAnnual += c.annual;
      pricedTools++;
    }
  }

  // ---- Gaps -----------------------------------------------------------------------------------
  const gaps: Gap[] = [];
  const effectiveTeam = teamSize ?? DEFAULT_SEATS;
  for (const cap of CAPABILITIES) {
    if (cap.tier === "recommended" && effectiveTeam < cap.minTeam) continue;
    if (cap.jobs.some((j) => jobsInStack.has(j))) continue;
    gaps.push({
      id: cap.id,
      label: cap.label,
      tier: cap.tier,
      why: cap.why,
      examples: cap.examples.filter((id) => byId.has(id)).slice(0, 4),
    });
  }
  const coreGaps = gaps.filter((g) => g.tier === "core");
  const recGaps = gaps.filter((g) => g.tier === "recommended");

  // ---- Score ----------------------------------------------------------------------------------
  const bloatLimit = teamSize ? Math.max(8, Math.round(6 + teamSize / 4)) : 12;
  const bloatPenalty = Math.min(12, Math.max(0, ids.length - bloatLimit) * 2);
  const cutPenalty = Math.min(6, ids.reduce((s, id) => s + (learned?.toolCutPenalty[id] ?? 0), 0));
  const raw = 100 - coreGaps.length * 15 - recGaps.length * 4 - overlapPenalty - partialPenalty - bloatPenalty - cutPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const grade = gradeFor(score);

  // ---- Explanation ----------------------------------------------------------------------------
  const direct = overlaps.filter((o) => o.severity === "direct");
  const line1 = coreGaps.length
    ? `Missing ${coreGaps.length === 1 ? "a core piece" : "core pieces"}: ${list(coreGaps.map((g) => g.label))}.`
    : recGaps.length
      ? `Covers CRM, data and outbound. Still missing: ${list(recGaps.map((g) => g.label.toLowerCase()))}.`
      : "Covers every job a team this size needs.";
  const line2 = direct.length
    ? `${direct.length} direct overlap${direct.length > 1 ? "s" : ""}: ` +
      direct
        .slice(0, 2)
        .map((o) => `${o.tools.filter((t) => t.primary).map((t) => name(t.id)).join(" + ")} on ${inline(o.jobLabel)}`)
        .join("; ") +
      (direct.length > 2 ? `; and ${direct.length - 2} more.` : ".")
    : overlaps.length
      ? `No two tools share a main job, but ${overlaps.length} side feature${overlaps.length > 1 ? "s" : ""} duplicate something you already pay for.`
      : "No two tools are doing the same job.";
  const line3 = waste.high > 0
    ? `Roughly ${fmt(waste.low)} to ${fmt(waste.high)} a year is going to duplicate tools (estimate from list prices).`
    : direct.length
      ? "The duplicate spend can't be estimated because the overlapping tools don't publish prices."
      : bloatPenalty > 0
        ? `${ids.length} tools${teamSize ? ` for a team of ${teamSize}` : ""} is a lot to keep adopted.`
        : "No duplicate spend found at list prices.";

  return {
    version: 1,
    tools: ids,
    unknown: input.unknown ?? [],
    teamSize,
    seats: Object.fromEntries(Object.entries(seatOverrides).filter(([id]) => byId.has(id) && ids.includes(id))),
    score,
    grade,
    explanation: [line1, line2, line3],
    overlaps,
    waste,
    knownSpend: { annual: roundMoney(knownAnnual), pricedTools, unpricedTools: tools.length - pricedTools },
    gaps,
    roast: roast({ toolIds: ids, grade, overlaps, gaps, wasteHigh: waste.high, name }),
    rulesVersion: learned?.version ?? BASE_RULES_VERSION,
  };
}

/** Share of past stacks this score beats, or null without enough data. */
export function percentile(score: number, learned: LearnedRules | null | undefined): number | null {
  const scores = learned?.scores ?? [];
  if (scores.length < 30) return null;
  const below = scores.filter((s) => s < score).length;
  return Math.round((below / scores.length) * 100);
}

export { jobLabel };
