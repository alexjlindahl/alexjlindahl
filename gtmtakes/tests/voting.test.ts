import { beforeEach, describe, expect, it } from "vitest";
import { castVote, hashIp, MAX_VOTES_PER_IP, votesByVoter } from "@/lib/votes";
import { autoSchedule, getDay, getTake, monthLeaderboard, refreshPatterns, getPatterns } from "@/lib/takes";
import { addTake, addVotes, BACKENDS, freshDb } from "./helpers";

const DAY = "2026-03-10";

describe.each(BACKENDS)("voting (%s)", (backend) => {
  let takeId: number;
  beforeEach(async () => {
    await freshDb(backend);
    takeId = await addTake({ day: DAY });
  });

  const vote = (over: Partial<Parameters<typeof castVote>[0]> = {}) => castVote({ takeId, choice: "hot", voterId: "v1", ip: "1.1.1.1", day: DAY, ...over });

  it("records a vote and returns the live counts", async () => {
    const r = await vote();
    expect(r).toMatchObject({ ok: true, duplicate: false, choice: "hot", counts: { hot: 1, not: 0, depends: 0 } });
    const r2 = await vote({ voterId: "v2", ip: "2.2.2.2", choice: "not" });
    expect(r2).toMatchObject({ ok: true, counts: { hot: 1, not: 1, depends: 0 } });
    const r3 = await vote({ voterId: "v3", ip: "3.3.3.3", choice: "depends" });
    expect(r3).toMatchObject({ ok: true, counts: { hot: 1, not: 1, depends: 1 } });
  });

  it("blocks a second vote from the same browser and keeps the first choice", async () => {
    await vote();
    const again = await vote({ choice: "not", ip: "9.9.9.9" });
    expect(again).toMatchObject({ ok: true, duplicate: true, choice: "hot", counts: { hot: 1, not: 0 } });
    expect((await getTake(takeId))!.counts).toEqual({ hot: 1, not: 0, depends: 0 });
  });

  it("caps votes per take from one IP even with fresh cookies", async () => {
    for (let i = 0; i < MAX_VOTES_PER_IP; i++) expect((await vote({ voterId: `fresh${i}` })).ok).toBe(true);
    const blocked = await vote({ voterId: "one-too-many" });
    expect(blocked).toMatchObject({ ok: false, status: 429 });
    expect((await getTake(takeId))!.counts.hot).toBe(MAX_VOTES_PER_IP);
    // the same network can still vote on a different take
    const other = await addTake({ day: DAY });
    expect((await vote({ takeId: other, voterId: "one-too-many" })).ok).toBe(true);
  });

  it("rejects bad input, unknown takes, unscheduled takes and closed days", async () => {
    expect(await vote({ choice: "maybe" })).toMatchObject({ ok: false, status: 400 });
    expect(await vote({ takeId: 99999 })).toMatchObject({ ok: false, status: 404 });
    const unscheduled = await addTake();
    expect(await vote({ takeId: unscheduled })).toMatchObject({ ok: false, status: 404 });
    expect(await vote({ day: "2026-03-11" })).toMatchObject({ ok: false, status: 409, error: "voting has closed for this take" });
    expect(await vote({ day: "2026-03-09" })).toMatchObject({ ok: false, status: 409 });
  });

  it("stores a hash, never the raw IP", async () => {
    await vote({ ip: "203.0.113.7" });
    const { getDb } = await import("@/lib/db");
    const row = await (await getDb()).get<{ ip_hash: string }>("SELECT ip_hash FROM votes");
    expect(row!.ip_hash).toBe(hashIp("203.0.113.7"));
    expect(row!.ip_hash).not.toContain("203.0.113.7");
  });

  it("reports which takes a voter already answered", async () => {
    const other = await addTake({ day: DAY });
    await vote({ choice: "not" });
    expect(await votesByVoter("v1", [takeId, other])).toEqual({ [takeId]: "not" });
    expect(await votesByVoter(undefined, [takeId])).toEqual({});
  });

  it("builds the monthly leaderboard from the closest splits", async () => {
    const close = await addTake({ day: "2026-03-02" });
    const lopsided = await addTake({ day: "2026-03-03" });
    const nextMonth = await addTake({ day: "2026-04-01" });
    await addVotes(close, 51, 49);
    await addVotes(lopsided, 90, 10);
    await addVotes(nextMonth, 50, 50);
    const board = await monthLeaderboard("2026-03", "2026-03-31");
    expect(board.map((t) => t.id)).toEqual([close, lopsided]);
  });

  it("learns from results and schedules the more debate-worthy candidates first", async () => {
    // Shown takes: pricing splits, plg does not.
    for (let i = 0; i < 4; i++) {
      await addVotes(await addTake({ day: `2026-03-0${i + 1}`, topic: "pricing", statement: `Pricing take ${i}` }), 50 + i, 50 - i);
      await addVotes(await addTake({ day: `2026-03-0${i + 1}`, topic: "plg", statement: `Plg take ${i}` }), 95, 5);
    }
    const model = await refreshPatterns();
    expect(model.patterns.get("topic:pricing")!.lift).toBeGreaterThan(0);
    const stored = await getPatterns();
    expect(stored[0].feature).toBe("topic:pricing");

    const plg = await addTake({ topic: "plg", statement: "Plg candidate" });
    const pricing = await addTake({ topic: "pricing", statement: "Pricing candidate" });
    await addTake({ topic: "pricing", statement: "Rejected one", status: "rejected" });
    expect(await autoSchedule("2026-03-20")).toBe(2);
    const lineup = await getDay("2026-03-20");
    expect(lineup.map((t) => t.id)).toEqual([pricing, plg]);
    // already-full or empty pool is a no-op
    expect(await autoSchedule("2026-03-20")).toBe(0);
  });
});
