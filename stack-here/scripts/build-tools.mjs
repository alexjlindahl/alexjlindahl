// Merges data/parts/*.json into data/tools.json and validates every entry against the schema.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const partsDir = path.join(root, "data/parts");
const schema = fs.readFileSync(path.join(root, "data/SCHEMA.md"), "utf8");
const grab = (label) =>
  schema.split(label)[1].split("\n\n")[0].split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
const CATEGORIES = new Set(grab("Categories:"));
const JOBS = new Set(grab("Jobs:"));

const errors = [];
const seen = new Map();
const out = [];
for (const file of fs.readdirSync(partsDir).filter((f) => f.endsWith(".json")).sort()) {
  const entries = JSON.parse(fs.readFileSync(path.join(partsDir, file), "utf8"));
  for (const t of entries) {
    const where = `${file}:${t.id}`;
    if (!t.id || !/^[a-z0-9-]+$/.test(t.id)) errors.push(`${where} bad id`);
    if (seen.has(t.id)) { errors.push(`${where} duplicate of ${seen.get(t.id)}`); continue; }
    seen.set(t.id, file);
    if (!t.name) errors.push(`${where} no name`);
    if (!CATEGORIES.has(t.category)) errors.push(`${where} bad category ${t.category}`);
    if (!Array.isArray(t.jobs) || !t.jobs.length) errors.push(`${where} no jobs`);
    for (const j of t.jobs ?? []) if (!JOBS.has(j)) errors.push(`${where} bad job ${j}`);
    const p = t.pricing ?? {};
    if (!["public", "not_public", "unverified"].includes(p.status)) errors.push(`${where} bad pricing.status`);
    if (p.status !== "public" && p.amount != null) errors.push(`${where} amount set but status ${p.status}`);
    if (p.status === "public" && !p.sourceUrl) errors.push(`${where} public price without sourceUrl`);
    if (p.amount != null && typeof p.amount !== "number") errors.push(`${where} amount not a number`);
    if (p.unit != null && !["seat/month", "month"].includes(p.unit)) errors.push(`${where} bad unit ${p.unit}`);
    out.push({
      id: t.id,
      name: t.name,
      aliases: [...new Set((t.aliases ?? []).map((a) => String(a).toLowerCase().trim()).filter(Boolean))],
      category: t.category,
      jobs: t.jobs,
      bestAt: t.bestAt ?? "",
      website: t.website ?? "",
      pricing: {
        status: p.status,
        amount: p.amount ?? null,
        currency: p.currency ?? null,
        unit: p.unit ?? null,
        plan: p.plan ?? null,
        billing: p.billing ?? null,
        hasFreeTier: !!p.hasFreeTier,
        note: p.note || (p.status === "not_public" ? "pricing not public" : p.status === "unverified" ? "pricing not verified" : ""),
        sourceUrl: p.sourceUrl ?? null,
        checkedOn: p.checkedOn ?? "2026-11-12",
      },
    });
  }
}

// Alias collisions: the same alias on two tools makes matching ambiguous.
const aliasOwner = new Map();
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
for (const t of out) {
  for (const a of [t.name, ...t.aliases]) {
    const k = norm(a);
    if (aliasOwner.has(k) && aliasOwner.get(k) !== t.id) errors.push(`alias "${a}" on both ${aliasOwner.get(k)} and ${t.id}`);
    else aliasOwner.set(k, t.id);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
fs.writeFileSync(path.join(root, "data/tools.json"), JSON.stringify(out, null, 2) + "\n");
const by = (k) => out.reduce((m, t) => ((m[k(t)] = (m[k(t)] ?? 0) + 1), m), {});
console.log(`${out.length} tools`, by((t) => t.pricing.status));
console.log(by((t) => t.category));
