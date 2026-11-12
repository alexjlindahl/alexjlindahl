import { describe, expect, it } from "vitest";
import { controversyScore, divisiveness, extractFeatures, learn, pickHeadlines, pickLineup, predict, split, wilsonLower } from "@/lib/scoring";

const c = (hot: number, not: number, depends = 0) => ({ hot, not, depends });

describe("split", () => {
  it("computes the hot/not split over decided votes only", () => {
    expect(split(c(62, 38, 25))).toEqual({ total: 125, decided: 100, hotPct: 62, notPct: 38, dependsPct: 20 });
  });
  it("always sums to 100 and handles zero votes", () => {
    const s = split(c(1, 2));
    expect(s.hotPct + s.notPct).toBe(100);
    expect(split(c(0, 0))).toMatchObject({ total: 0, hotPct: 0, notPct: 0, dependsPct: 0 });
    expect(split(c(0, 0, 4))).toMatchObject({ total: 4, decided: 0, hotPct: 0, notPct: 0, dependsPct: 100 });
  });
});

describe("divisiveness", () => {
  it("is 1 at 50/50, 0 when unanimous or empty, symmetric", () => {
    expect(divisiveness(c(50, 50))).toBe(1);
    expect(divisiveness(c(10, 0))).toBe(0);
    expect(divisiveness(c(0, 0))).toBe(0);
    expect(divisiveness(c(70, 30))).toBeCloseTo(0.6);
    expect(divisiveness(c(30, 70))).toBeCloseTo(divisiveness(c(70, 30)));
  });
  it("ignores it-depends votes", () => {
    expect(divisiveness(c(70, 30, 500))).toBeCloseTo(0.6);
  });
});

describe("controversyScore", () => {
  it("does not let a tiny tie outrank a large near-tie", () => {
    expect(controversyScore(c(240, 260))).toBeGreaterThan(controversyScore(c(1, 1)));
  });
  it("still ranks by closeness when samples are similar", () => {
    expect(controversyScore(c(100, 100))).toBeGreaterThan(controversyScore(c(140, 60)));
  });
});

describe("wilsonLower", () => {
  it("is conservative on small samples", () => {
    expect(wilsonLower(3, 3)).toBeLessThan(wilsonLower(90, 100));
    expect(wilsonLower(0, 0)).toBe(0);
  });
});

describe("pickHeadlines", () => {
  it("finds most divisive, most agreed and most rejected", () => {
    const takes = [
      { id: "split", counts: c(51, 49) },
      { id: "loved", counts: c(95, 5) },
      { id: "hated", counts: c(8, 92) },
      { id: "meh", counts: c(60, 40) },
      { id: "unvoted", counts: c(0, 0) },
    ];
    const h = pickHeadlines(takes);
    expect(h.divisive?.id).toBe("split");
    expect(h.agreed?.id).toBe("loved");
    expect(h.rejected?.id).toBe("hated");
  });
  it("returns nothing when nobody voted, and never awards 'rejected' to a take people liked", () => {
    expect(pickHeadlines([{ counts: c(0, 0) }])).toEqual({ divisive: undefined, agreed: undefined, rejected: undefined });
    const h = pickHeadlines([{ id: 1, counts: c(50, 50) }, { id: 2, counts: c(90, 10) }, { id: 3, counts: c(80, 20) }]);
    expect(h.rejected).toBeUndefined();
  });
});

describe("extractFeatures", () => {
  it("tags topic and phrasing", () => {
    const f = extractFeatures("Cold calling is dead and SDRs should stop doing it", "outbound");
    expect(f).toContain("topic:outbound");
    expect(f).toContain("phrasing:absolute");
    expect(f).toContain("phrasing:prescriptive");
    expect(f).toContain("phrasing:role-callout");
    expect(f).toContain("phrasing:short");
  });
  it("detects tools, numbers and predictions", () => {
    const f = extractFeatures("Clay will replace 50% of RevOps work by 2028", "clay");
    expect(f).toEqual(expect.arrayContaining(["phrasing:names-tool", "phrasing:number", "phrasing:prediction"]));
  });
});

describe("learning loop", () => {
  // History: pricing takes split voters, PLG takes are lopsided.
  const history = [
    ...[c(52, 48), c(45, 55), c(60, 50), c(48, 52)].map((counts, i) => ({ features: extractFeatures(`Usage pricing always wins ${i}`, "pricing"), counts })),
    ...[c(95, 5), c(8, 92), c(90, 12), c(85, 9)].map((counts, i) => ({ features: extractFeatures(`PLG is a fine motion for some teams out there ${i}`, "plg"), counts })),
  ];
  const model = learn(history);

  it("learns which topics and phrasings divide people", () => {
    expect(model.nTakes).toBe(8);
    expect(model.patterns.get("topic:pricing")!.lift).toBeGreaterThan(0);
    expect(model.patterns.get("topic:plg")!.lift).toBeLessThan(0);
    expect(model.patterns.get("phrasing:absolute")!.lift).toBeGreaterThan(0);
  });

  it("ranks a candidate in a divisive topic above one in a lopsided topic", () => {
    const a = predict(model, extractFeatures("Seat pricing always loses to usage pricing", "pricing"));
    const b = predict(model, extractFeatures("PLG is a fine motion for some teams out there", "plg"));
    expect(a.predicted).toBeGreaterThan(b.predicted);
    expect(a.rank).toBeGreaterThan(b.rank);
  });

  it("ignores takes with too few votes and falls back to a neutral prior with no data", () => {
    const empty = learn([{ features: ["topic:clay"], counts: c(1, 1) }]);
    expect(empty.nTakes).toBe(0);
    expect(empty.mean).toBe(0.5);
    expect(predict(empty, ["topic:clay"]).predicted).toBe(0.5);
  });

  it("gives unseen features an exploration bonus and uses the LLM debate score as a prior", () => {
    const seen = predict(model, ["topic:pricing"]);
    const unseen = predict(model, ["topic:clay"]);
    expect(unseen.explore).toBeGreaterThan(seen.explore);
    expect(predict(model, ["topic:clay"], 0.9).rank).toBeGreaterThan(predict(model, ["topic:clay"], 0.1).rank);
  });

  it("shrinks one-off results toward the mean", () => {
    const m = learn([...history, { features: ["topic:clay"], counts: c(50, 50) }]);
    const clay = m.patterns.get("topic:clay")!;
    expect(clay.avgDivisiveness).toBeLessThan(1);
    expect(clay.avgDivisiveness).toBeGreaterThan(m.mean);
  });
});

describe("pickLineup", () => {
  const mk = (id: number, topic: string, author: string, rank: number) => ({ id, topic, author_handle: author, rank });
  it("takes the best ranked while capping topics and authors", () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => mk(i + 1, "pricing", `p${i}`, 0.9 - i * 0.01)),
      mk(7, "plg", "sameguy", 0.5),
      mk(8, "plg", "SameGuy", 0.49),
      mk(9, "clay", "c1", 0.4),
      mk(10, "outbound", "o1", 0.3),
    ];
    const picked = pickLineup(pool, 5, 3);
    expect(picked.map((p) => p.id)).toEqual([1, 2, 3, 7, 9]);
  });
  it("relaxes the caps rather than leaving the day short", () => {
    const pool = Array.from({ length: 10 }, (_, i) => mk(i + 1, "pricing", "one", 1 - i * 0.01));
    expect(pickLineup(pool, 10)).toHaveLength(10);
  });
});
