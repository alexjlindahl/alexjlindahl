import { describe, expect, it } from "vitest";
import { createMatcher, editDistance, normalize } from "@/lib/parse";
import { SAMPLES } from "@/lib/samples";
import { TOOLS } from "@/lib/tools";

const m = createMatcher(TOOLS);
const ids = (text: string) => m.parse(text).matched.map((x) => x.toolId);

describe("normalize", () => {
  it("lowercases and strips punctuation and parentheticals", () => {
    expect(normalize("  Apollo.io ")).toBe("apollo io");
    expect(normalize("Chorus (ZoomInfo)")).toBe("chorus");
    expect(normalize("Seamless.AI")).toBe("seamless ai");
  });
});

describe("editDistance", () => {
  it("counts edits, with a transposition as one", () => {
    expect(editDistance("gong", "gong")).toBe(0);
    expect(editDistance("hubspot", "hubspt")).toBe(1);
    expect(editDistance("outreach", "outraech")).toBe(1);
    expect(editDistance("salesforce", "salesloft", 2)).toBeGreaterThan(2);
  });
});

describe("parsing a stack", () => {
  it("parses the example from the brief", () => {
    expect(ids("Clay, HubSpot, Apollo, Outreach, Gong")).toEqual(["clay", "hubspot", "apollo", "outreach", "gong"]);
  });

  it("handles new lines, bullets, 'and', slashes and mixed case", () => {
    expect(ids("- clay\n- HUBSPOT\n1. gong")).toEqual(["clay", "hubspot", "gong"]);
    expect(ids("Outreach/Salesloft and Gong + Clari")).toEqual(["outreach", "salesloft", "gong", "clari"]);
  });

  it("matches aliases and domain suffixes", () => {
    expect(ids("SFDC, sales nav, zoom info, apollo.io, gong.io, instantly.ai")).toEqual([
      "salesforce", "linkedin-sales-navigator", "zoominfo", "apollo", "gong", "instantly",
    ]);
  });

  it("tolerates typos", () => {
    expect(ids("Hubspt, Outraech, Zoominfoo, Salesforse, Calendley")).toEqual([
      "hubspot", "outreach", "zoominfo", "salesforce", "calendly",
    ]);
    expect(m.match("Hubspt")?.method).toBe("fuzzy");
    expect(m.match("HubSpot")?.method).toBe("exact");
  });

  it("does not fuzzy-match short or unrelated words", () => {
    const r = m.parse("Excel, Gonk, Notion, Slack");
    expect(r.matched).toEqual([]);
    expect(r.unknown).toEqual(["Excel", "Gonk", "Notion", "Slack"]);
  });

  it("keeps tools with tricky names intact", () => {
    expect(ids("tl;dv, 11x, 6sense, Cal.com, Reply.io")).toEqual(["tldv", "11x", "6sense", "cal-com", "reply-io"]);
  });

  it("splits space-separated lists", () => {
    expect(ids("Clay HubSpot Apollo Gong")).toEqual(["clay", "hubspot", "apollo", "gong"]);
    expect(ids("HubSpot Sales Hub Enterprise")).toEqual(["hubspot"]);
  });

  it("de-duplicates", () => {
    expect(ids("Apollo, apollo.io, APOLLO")).toEqual(["apollo"]);
  });

  it("reads inline seat counts", () => {
    const r = m.parse("Gong x10, Outreach (15 seats), Apollo: 5, Salesforce 40 users, 11x");
    expect(r.matched.map((x) => [x.toolId, x.seats])).toEqual([
      ["gong", 10], ["outreach", 15], ["apollo", 5], ["salesforce", 40], ["11x", undefined],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(m.parse("")).toEqual({ matched: [], unknown: [] });
    expect(m.parse(" , ,\n")).toEqual({ matched: [], unknown: [] });
  });

  it("recognizes every tool in the ten sample stacks", () => {
    expect(SAMPLES).toHaveLength(10);
    for (const s of SAMPLES) {
      const r = m.parse(s.text);
      expect(r.unknown, s.label).toEqual([]);
      expect(r.matched.length, s.label).toBe(s.text.split(",").length);
    }
  });

  it("finds every tool in the database by its own name", () => {
    for (const t of TOOLS) expect(m.match(t.name)?.toolId, t.name).toBe(t.id);
  });
});
