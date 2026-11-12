import { beforeEach, describe, expect, it } from "vitest";
import { buildWeekly } from "@/lib/export";
import { addTake, addVotes, freshDb } from "./helpers";

describe("weekly export", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("lists the top 5 most divisive takes of the week with splits and source links", async () => {
    const spec: [string, number, number, number][] = [
      ["2026-03-02", 50, 50, 10], // most divisive
      ["2026-03-03", 55, 45, 0],
      ["2026-03-04", 40, 60, 0],
      ["2026-03-05", 70, 30, 0],
      ["2026-03-06", 25, 75, 0],
      ["2026-03-07", 95, 5, 0], // 6th: left out
      ["2026-03-08", 2, 2, 0], // perfect tie but only 4 votes: must not beat the big splits
      ["2026-02-28", 50, 50, 0], // before the window
      ["2026-03-09", 50, 50, 0], // after the window
    ];
    const ids: number[] = [];
    for (const [day, hot, not, dep] of spec) {
      const id = await addTake({ day, statement: `Statement for ${day}`, handle: `author_${day.replaceAll("-", "")}` });
      await addVotes(id, hot, not, dep);
      ids.push(id);
    }
    const w = await buildWeekly({ weekEnding: "2026-03-08" });
    expect(w.from).toBe("2026-03-02");
    expect(w.takes.map((t) => t.id)).toEqual(ids.slice(0, 5));

    const md = w.markdown;
    expect(md).toContain("## GTM Twitter");
    expect(md).toContain("Mar 2 to Mar 8, 2026");
    expect(md).toContain('1. **“Statement for 2026-03-02”**');
    expect(md).toContain('50% Hot / 50% Not (110 votes, 9% said "it depends")');
    expect(md).toContain("[@author_20260302 on X](https://x.com/author_20260302/status/");
    expect(md).toContain("25% Hot / 75% Not (100 votes)");
    expect(md).not.toContain("2026-03-07");
    expect(md).not.toContain("2026-02-28");
    expect(md).not.toContain("2026-03-09");
    expect(md).not.toContain("Sample data");
    expect(md.match(/^\d\. /gm)).toHaveLength(5);
  });

  it("flags sample votes so seeded numbers are not published by accident", async () => {
    const id = await addTake({ day: "2026-03-05" });
    await addVotes(id, 10, 10, 0, "seed");
    const w = await buildWeekly({ weekEnding: "2026-03-08" });
    expect(w.markdown).toMatch(/^> \*\*Sample data\.\*\*/);
  });

  it("handles a week with no votes", async () => {
    await addTake({ day: "2026-03-05" });
    const w = await buildWeekly({ weekEnding: "2026-03-08" });
    expect(w.takes).toEqual([]);
    expect(w.markdown).toContain("No takes collected enough votes");
  });
});
