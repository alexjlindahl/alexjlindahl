import { describe, expect, it } from "vitest";
import { analyze, annualCost, gradeFor, percentile } from "@/lib/grade";
import { computeInsights, computeLearnedRules } from "@/lib/learn";
import { createMatcher } from "@/lib/parse";
import { SAMPLES } from "@/lib/samples";
import type { LearnedRules, Tool } from "@/lib/types";
import { TOOLS } from "@/lib/tools";

/** Small fixed database so grading tests don't move when real prices change. */
function tool(id: string, jobs: string[], amount: number | null, unit: "seat/month" | "month" | null = "seat/month", status: Tool["pricing"]["status"] = amount == null ? "not_public" : "public"): Tool {
  return {
    id, name: id.toUpperCase(), aliases: [], category: "crm", jobs, bestAt: `${id} thing`, website: "",
    pricing: { status, amount, currency: amount == null ? null : "USD", unit: amount == null ? null : unit, plan: null, billing: null, hasFreeTier: false, note: "", sourceUrl: amount == null ? null : "https://example.com", checkedOn: "2026-11-12" },
  };
}
const FIX: Tool[] = [
  tool("crm1", ["crm"], 50),
  tool("crm2", ["crm"], 20),
  tool("data1", ["contact-data"], 100),
  tool("data2", ["contact-data"], 40),
  tool("data3", ["contact-data"], null),
  tool("seq1", ["sales-engagement"], 80),
  tool("seq2", ["sales-engagement", "contact-data"], 60),
  tool("notes1", ["meeting-notes"], 10),
  tool("sched1", ["scheduling"], 500, "month"),
  tool("sched2", ["scheduling"], 100, "month"),
  tool("auto1", ["workflow-automation"], 20, "month"),
  tool("wf1", ["waterfall-enrichment", "data-orchestration"], 150, "month"),
];
const run = (toolIds: string[], teamSize: number | null = 8, extra: Partial<Parameters<typeof analyze>[0]> = {}, learned?: LearnedRules) =>
  analyze({ toolIds, teamSize, ...extra }, { tools: FIX, learned });

describe("gradeFor", () => {
  it("maps scores to letters", () => {
    expect([100, 88, 87, 75, 74, 60, 59, 45, 44, 0].map(gradeFor)).toEqual(["A", "A", "B", "B", "C", "C", "D", "D", "F", "F"]);
  });
});

describe("annualCost", () => {
  it("multiplies per-seat prices by seats and leaves flat plans alone", () => {
    expect(annualCost(FIX[0], 10)?.annual).toBe(6000);
    expect(annualCost(FIX[8], 10)?.annual).toBe(6000);
  });
  it("returns null without a public USD price", () => {
    expect(annualCost(FIX[4], 10)).toBeNull();
    expect(annualCost({ ...FIX[0], pricing: { ...FIX[0].pricing, currency: "EUR" } }, 10)).toBeNull();
    expect(annualCost({ ...FIX[0], pricing: { ...FIX[0].pricing, amount: 0 } }, 10)).toBeNull();
    expect(annualCost({ ...FIX[0], pricing: { ...FIX[0].pricing, status: "unverified" } }, 10)).toBeNull();
  });
});

describe("analyze", () => {
  it("gives a clean, complete stack an A with no waste", () => {
    const r = run(["crm1", "data1", "seq1", "notes1", "sched1", "auto1"]);
    expect(r.grade).toBe("A");
    expect(r.score).toBe(100);
    expect(r.overlaps).toEqual([]);
    expect(r.gaps).toEqual([]);
    expect(r.waste.low).toBe(0);
    expect(r.waste.high).toBe(0);
    expect(r.explanation).toHaveLength(3);
  });

  it("flags a direct overlap and prices the cheaper duplicate", () => {
    const r = run(["crm1", "data1", "data2", "seq1", "notes1", "sched1", "auto1"]);
    const o = r.overlaps.find((x) => x.job === "contact-data")!;
    expect(o.severity).toBe("direct");
    expect(o.tools.map((t) => t.id).sort()).toEqual(["data1", "data2"]);
    // data2 is the duplicate: $40 x 8 seats x 12 = $3,840, rounded to the nearest $100
    expect(r.waste.items.map((i) => i.toolId)).toEqual(["data2"]);
    expect(r.waste.high).toBe(3800);
    expect(r.waste.low).toBe(1900);
    expect(r.score).toBe(94);
  });

  it("never prices a tool without a public price, and says it was left out", () => {
    const r = run(["crm1", "data1", "data3", "seq1"]);
    // The unpriced tool is assumed to be the keeper, so the priced one counts as the duplicate.
    expect(r.waste.items.map((i) => i.toolId)).toEqual(["data1"]);
    expect(r.waste.excluded).toEqual([{ toolId: "data3", reason: "pricing not public" }]);
    const none = analyze({ toolIds: ["crm1", "data3", "seq1"], teamSize: 10 }, { tools: FIX });
    expect(none.waste.high).toBe(0);
  });

  it("uses per-tool seats over team size, and a labeled default without either", () => {
    const withSeats = run(["crm1", "crm2", "data1", "seq1"], 10, { seats: { crm2: 3 } });
    expect(withSeats.waste.high).toBe(720); // 20 x 3 x 12
    const noTeam = run(["crm1", "crm2", "data1", "seq1"], null);
    expect(noTeam.waste.high).toBe(1200); // 20 x 5 x 12
    expect(noTeam.waste.assumptions.join(" ")).toMatch(/5 seats/);
  });

  it("treats a side feature as a partial overlap: flagged, not priced", () => {
    const r = run(["crm1", "data1", "seq2"]);
    const o = r.overlaps.find((x) => x.job === "contact-data")!;
    expect(o.severity).toBe("partial");
    expect(r.waste.high).toBe(0);
    expect(r.score).toBe(86); // -2 partial, -4 each for call capture, scheduling, automation
  });

  it("reports core and recommended gaps by team size", () => {
    const tiny = run(["crm1"], 2);
    expect(tiny.gaps.map((g) => g.id)).toEqual(["data", "outreach"]);
    expect(tiny.grade).toBe("C");
    const big = run(["crm1", "data1", "seq1"], 50);
    expect(big.gaps.map((g) => g.id)).toEqual(["call-capture", "scheduling", "automation", "signals", "analytics", "enablement"]);
    expect(big.gaps.every((g) => g.tier === "recommended")).toBe(true);
  });

  it("penalizes two CRMs heavily", () => {
    const r = run(["crm1", "crm2", "data1", "seq1", "notes1", "sched1", "auto1"]);
    expect(r.score).toBe(88);
    expect(r.roast).toMatch(/CRM/);
  });

  it("softens data overlaps when a waterfall tool is present", () => {
    const without = run(["crm1", "data1", "data2", "seq1", "notes1", "sched1", "auto1"]);
    const withWf = run(["crm1", "data1", "data2", "seq1", "notes1", "sched1", "wf1"]);
    expect(withWf.score).toBeGreaterThan(without.score);
    expect(withWf.overlaps[0].advice).toMatch(/waterfall/i);
  });

  it("applies learned rules", () => {
    const learned: LearnedRules = {
      version: "learned-test", generatedAt: "", sampleSize: { submissions: 100, cuts: 50 },
      jobWeight: { "contact-data": 1.5 }, toolCutPenalty: { seq1: 3 }, scores: [],
    };
    const base = run(["crm1", "data1", "data2", "seq1", "notes1", "sched1", "auto1"]);
    const adj = run(["crm1", "data1", "data2", "seq1", "notes1", "sched1", "auto1"], 8, {}, learned);
    expect(base.score - adj.score).toBe(6); // 6 x 0.5 more overlap penalty + 3 cut penalty
    expect(adj.rulesVersion).toBe("learned-test");
  });

  it("ignores unknown ids and duplicates, and is deterministic", () => {
    const a = run(["crm1", "crm1", "nope", "data1", "seq1"]);
    expect(a.tools).toEqual(["crm1", "data1", "seq1"]);
    expect(run(["crm1", "crm1", "nope", "data1", "seq1"])).toEqual(a);
  });

  it("keeps the score between 0 and 100", () => {
    const r = run(FIX.map((t) => t.id), 2);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("percentile", () => {
  it("needs 30 scores", () => {
    expect(percentile(80, null)).toBeNull();
    const scores = Array.from({ length: 40 }, (_, i) => i * 2);
    expect(percentile(40, { scores } as LearnedRules)).toBe(50);
  });
});

describe("real database: ten sample stacks", () => {
  const m = createMatcher(TOOLS);
  const results = SAMPLES.map((s) => ({
    s,
    r: analyze({ toolIds: m.parse(s.text).matched.map((x) => x.toolId), teamSize: s.teamSize }, { tools: TOOLS }),
  }));
  const get = (label: string) => results.find((x) => x.s.label === label)!.r;

  it("every sample produces a complete result", () => {
    for (const { s, r } of results) {
      expect(r.tools.length, s.label).toBeGreaterThan(0);
      expect(["A", "B", "C", "D", "F"], s.label).toContain(r.grade);
      expect(r.explanation.every((l) => l.length > 10), s.label).toBe(true);
      expect(r.roast.length, s.label).toBeGreaterThan(10);
      expect(r.roast.length, s.label).toBeLessThanOrEqual(90);
      expect(r.waste.low, s.label).toBeLessThanOrEqual(r.waste.high);
      // Every dollar counted traces to a public USD price with a source.
      for (const i of r.waste.items) {
        const p = TOOLS.find((t) => t.id === i.toolId)!.pricing;
        expect(p.status, i.toolId).toBe("public");
        expect(p.sourceUrl, i.toolId).toBeTruthy();
      }
    }
  });

  it("grades them in a sensible order", () => {
    expect(get("Seed-stage outbound").grade).toBe("A");
    expect(["D", "F"]).toContain(get("Two of everything").grade);
    expect(get("Two of everything").score).toBeLessThan(get("Mid-market balanced").score);
    expect(get("Data hoarder").overlaps.find((o) => o.job === "contact-data")?.severity).toBe("direct");
    expect(get("Just a CRM").gaps.map((g) => g.id)).toEqual(["data", "outreach"]);
    expect(get("Notetaker pile-up").overlaps.some((o) => o.job === "meeting-notes" && o.severity === "direct")).toBe(true);
    expect(get("AI SDR curious").overlaps.some((o) => o.job === "ai-sdr" && o.severity === "direct")).toBe(true);
  });
});

describe("tool database", () => {
  it("has at least 150 tools and never a price without a source", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(150);
    for (const t of TOOLS) {
      if (t.pricing.amount != null) {
        expect(t.pricing.status, t.id).toBe("public");
        expect(t.pricing.sourceUrl, t.id).toMatch(/^https:\/\//);
      }
      if (t.pricing.status === "not_public") expect(t.pricing.note.toLowerCase(), t.id).toContain("pricing not public");
    }
  });
});

describe("learning loop", () => {
  const sub = (id: string, tools: string[]) => {
    const result = analyze({ toolIds: tools, teamSize: 10 }, { tools: FIX });
    return { id, tools: [...tools].sort(), teamSize: 10, score: result.score, grade: result.grade, result, createdAt: "" };
  };
  const cut = (toolId: string, reason = "overlap", replacedBy: string | null = null) => ({ toolId, reason, replacedBy, note: null, createdAt: "" });

  it("changes nothing on small samples", () => {
    const rules = computeLearnedRules([sub("a", ["crm1", "data1", "data2"])], [cut("data2")], FIX);
    expect(rules.jobWeight).toEqual({});
    expect(rules.toolCutPenalty).toEqual({});
  });

  it("raises the weight of jobs whose duplicates get cut, and penalizes often-cut tools", () => {
    const subs = [
      ...Array.from({ length: 30 }, (_, i) => sub("d" + i, ["crm1", "data1", "data2", "seq1"])),
      ...Array.from({ length: 30 }, (_, i) => sub("s" + i, ["crm1", "data1", "sched1", "sched2", "seq1"])),
    ];
    const cuts = Array.from({ length: 28 }, () => cut("data2"));
    const rules = computeLearnedRules(subs, cuts, FIX);
    expect(rules.jobWeight["contact-data"]).toBe(1.5);
    expect(rules.jobWeight["scheduling"]).toBe(0.7);
    expect(rules.toolCutPenalty).toEqual({ data2: 3 });
    expect(rules.scores).toHaveLength(60);
  });

  it("summarizes stacks, overlaps and cuts for the insights page", () => {
    const subs = [sub("a", ["crm1", "data1", "data2"]), sub("b", ["data2", "crm1", "data1"]), sub("c", ["crm1", "seq1"])];
    const ins = computeInsights(subs, [cut("data2", "replaced", "seq1"), cut("data2", "cost")], FIX);
    expect(ins.topStacks[0]).toEqual({ tools: ["crm1", "data1", "data2"], count: 2 });
    expect(ins.topTools[0]).toEqual({ id: "crm1", count: 3 });
    expect(ins.topOverlaps[0]).toEqual({ job: "contact-data", tools: ["data1", "data2"], count: 2 });
    expect(ins.mostCut[0]).toMatchObject({ id: "data2", count: 2, seen: 2 });
    expect(ins.replacements[0]).toMatchObject({ from: "data2", to: "seq1", sharesJob: false });
  });
});
