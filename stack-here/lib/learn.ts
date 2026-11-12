/**
 * The learning loop. Reads stored submissions and "I cut a tool" reports and produces LearnedRules,
 * which the grader applies on top of the base rules. Pure functions here; lib/store does the I/O.
 */
import { JOBS } from "./taxonomy";
import type { LearnedRules, Tool } from "./types";
import type { CutRow, SubmissionRow } from "./store";

/** Below these counts nothing is adjusted: small samples should not move grades. */
export const MIN_CUTS_FOR_JOB_WEIGHTS = 25;
export const MIN_CUTS_PER_TOOL = 5;
export const MIN_APPEARANCES_PER_TOOL = 20;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function computeLearnedRules(submissions: SubmissionRow[], cuts: CutRow[], tools: Tool[]): LearnedRules {
  const byId = new Map(tools.map((t) => [t.id, t]));

  // 1. Job weights. If users keep cutting tools from one job "because another tool did it",
  //    overlaps on that job are costing more than the base rule assumes, and the reverse.
  const jobWeight: Record<string, number> = {};
  const overlapCuts = cuts.filter((c) => c.reason === "overlap" || c.reason === "replaced");
  if (overlapCuts.length >= MIN_CUTS_FOR_JOB_WEIGHTS) {
    const cutsByJob = new Map<string, number>();
    for (const c of overlapCuts) {
      const job = byId.get(c.toolId)?.jobs[0];
      if (job) cutsByJob.set(job, (cutsByJob.get(job) ?? 0) + 1);
    }
    const flagsByJob = new Map<string, number>();
    for (const s of submissions) {
      for (const o of s.result.overlaps ?? []) {
        if (o.severity === "direct") flagsByJob.set(o.job, (flagsByJob.get(o.job) ?? 0) + 1);
      }
    }
    const totalFlags = [...flagsByJob.values()].reduce((a, b) => a + b, 0);
    const baseline = totalFlags ? overlapCuts.length / totalFlags : 0;
    for (const [job, flags] of flagsByJob) {
      if (!JOBS[job] || flags < 10 || !baseline) continue;
      const rate = (cutsByJob.get(job) ?? 0) / flags;
      // Twice the average cut rate -> 1.5x weight; no cuts at all -> 0.7x.
      const mult = clamp(0.7 + 0.4 * (rate / baseline), 0.7, 1.5);
      if (Math.abs(mult - 1) >= 0.05) jobWeight[job] = Math.round(mult * 100) / 100;
    }
  }

  // 2. Tools that get cut unusually often.
  const toolCutPenalty: Record<string, number> = {};
  const appearances = new Map<string, number>();
  for (const s of submissions) for (const id of s.tools) appearances.set(id, (appearances.get(id) ?? 0) + 1);
  const cutCount = new Map<string, number>();
  for (const c of cuts) cutCount.set(c.toolId, (cutCount.get(c.toolId) ?? 0) + 1);
  for (const [id, n] of cutCount) {
    const seen = appearances.get(id) ?? 0;
    if (n < MIN_CUTS_PER_TOOL || seen < MIN_APPEARANCES_PER_TOOL) continue;
    const rate = n / seen;
    if (rate >= 0.2) toolCutPenalty[id] = clamp(Math.round(rate * 6), 1, 3);
  }

  // 3. Score distribution for "beats X% of stacks".
  const scores = submissions.map((s) => s.score).sort((a, b) => a - b);
  const sample = scores.length > 500 ? scores.filter((_, i) => i % Math.ceil(scores.length / 500) === 0) : scores;

  const now = new Date();
  return {
    version: `learned-${now.toISOString().slice(0, 10)}`,
    generatedAt: now.toISOString(),
    sampleSize: { submissions: submissions.length, cuts: cuts.length },
    jobWeight,
    toolCutPenalty,
    scores: sample,
  };
}

// ---- Insights -----------------------------------------------------------------------------------

export interface Insights {
  totals: { submissions: number; cuts: number; avgScore: number | null };
  grades: Record<string, number>;
  topTools: { id: string; count: number }[];
  topStacks: { tools: string[]; count: number }[];
  topPairs: { a: string; b: string; count: number }[];
  topOverlaps: { job: string; tools: string[]; count: number }[];
  topOverlapJobs: { job: string; count: number }[];
  mostCut: { id: string; count: number; seen: number; reasons: Record<string, number> }[];
  replacements: { from: string; to: string; count: number; sharesJob: boolean }[];
}

function top<K>(m: Map<string, { key: K; count: number }>, n: number) {
  return [...m.values()].sort((x, y) => y.count - x.count).slice(0, n);
}

export function computeInsights(submissions: SubmissionRow[], cuts: CutRow[], tools: Tool[]): Insights {
  const byId = new Map(tools.map((t) => [t.id, t]));
  const bump = <K>(m: Map<string, { key: K; count: number }>, k: string, key: K) => {
    const e = m.get(k);
    if (e) e.count++;
    else m.set(k, { key, count: 1 });
  };

  const toolCounts = new Map<string, { key: string; count: number }>();
  const stackCounts = new Map<string, { key: string[]; count: number }>();
  const pairCounts = new Map<string, { key: [string, string]; count: number }>();
  const overlapCounts = new Map<string, { key: { job: string; tools: string[] }; count: number }>();
  const overlapJobCounts = new Map<string, { key: string; count: number }>();
  const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  for (const s of submissions) {
    grades[s.grade] = (grades[s.grade] ?? 0) + 1;
    const ids = [...s.tools].sort();
    for (const id of ids) bump(toolCounts, id, id);
    if (ids.length >= 2) bump(stackCounts, ids.join("|"), ids);
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) bump(pairCounts, ids[i] + "|" + ids[j], [ids[i], ids[j]]);
    for (const o of s.result.overlaps ?? []) {
      if (o.severity !== "direct") continue;
      const t = o.tools.filter((x) => x.primary).map((x) => x.id).sort();
      bump(overlapCounts, o.job + ":" + t.join("|"), { job: o.job, tools: t });
      bump(overlapJobCounts, o.job, o.job);
    }
  }

  const cutMap = new Map<string, { count: number; reasons: Record<string, number> }>();
  const replMap = new Map<string, { key: { from: string; to: string }; count: number }>();
  for (const c of cuts) {
    const e = cutMap.get(c.toolId) ?? { count: 0, reasons: {} };
    e.count++;
    e.reasons[c.reason] = (e.reasons[c.reason] ?? 0) + 1;
    cutMap.set(c.toolId, e);
    if (c.replacedBy) bump(replMap, c.toolId + ">" + c.replacedBy, { from: c.toolId, to: c.replacedBy });
  }

  return {
    totals: {
      submissions: submissions.length,
      cuts: cuts.length,
      avgScore: submissions.length ? Math.round(submissions.reduce((a, s) => a + s.score, 0) / submissions.length) : null,
    },
    grades,
    topTools: top(toolCounts, 20).map((e) => ({ id: e.key, count: e.count })),
    topStacks: top(stackCounts, 10).map((e) => ({ tools: e.key, count: e.count })),
    topPairs: top(pairCounts, 15).map((e) => ({ a: e.key[0], b: e.key[1], count: e.count })),
    topOverlaps: top(overlapCounts, 15).map((e) => ({ ...e.key, count: e.count })),
    topOverlapJobs: top(overlapJobCounts, 10).map((e) => ({ job: e.key, count: e.count })),
    mostCut: [...cutMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([id, e]) => ({ id, count: e.count, seen: toolCounts.get(id)?.count ?? 0, reasons: e.reasons })),
    replacements: top(replMap, 15).map((e) => {
      const a = byId.get(e.key.from);
      const b = byId.get(e.key.to);
      return { ...e.key, count: e.count, sharesJob: !!a && !!b && a.jobs.some((j) => b.jobs.includes(j)) };
    }),
  };
}
