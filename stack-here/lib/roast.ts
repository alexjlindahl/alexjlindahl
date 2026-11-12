import type { Gap, OverlapFlag } from "./types";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

interface RoastInput {
  toolIds: string[];
  grade: string;
  overlaps: OverlapFlag[];
  gaps: Gap[];
  wasteHigh: number;
  name: (id: string) => string;
}

/** One line for the share card. Deterministic for a given stack. */
export function roast(input: RoastInput): string {
  const { toolIds, grade, overlaps, gaps, wasteHigh, name } = input;
  const pick = (options: string[]) => options[hash(toolIds.join("|")) % options.length];
  const direct = (job: string) => {
    const o = overlaps.find((x) => x.job === job && x.severity === "direct");
    return o ? o.tools.filter((t) => t.primary).map((t) => name(t.id)) : [];
  };
  const hasGap = (id: string) => gaps.some((g) => g.id === id);
  const n = toolIds.length;

  const crms = direct("crm");
  if (crms.length >= 2) {
    return pick([
      `${crms.length === 2 ? "Two" : crms.length} CRMs. ${crms.length === 2 ? "Twice" : "Several times"} the single source of truth.`,
      `${crms[0]} and ${crms[1]}: two systems of record, zero agreement.`,
    ]);
  }
  const data = direct("contact-data");
  if (data.length >= 3) {
    return pick([
      `${data.length} contact databases and the emails still bounce.`,
      `${data.length} contact databases. Same people, ${data.length} invoices.`,
    ]);
  }
  const seq = direct("sales-engagement").concat(direct("cold-email"));
  if (seq.length >= 2) {
    return pick([
      `${seq[0]} and ${seq[1]} are sequencing the same prospects. The prospects noticed.`,
      `${seq[0]} and ${seq[1]}: two sequencers, one very tired inbox.`,
    ]);
  }
  if (data.length === 2) {
    return pick([
      `${data[0]} and ${data[1]}: paying twice for the same phone number.`,
      `${data[0]} plus ${data[1]}. The contacts are identical. The invoices are not.`,
    ]);
  }
  const sdr = direct("ai-sdr");
  if (sdr.length >= 2) return `${sdr.length} AI SDRs. Somewhere, two robots are emailing each other.`;
  const rec = direct("conversation-intelligence").concat(direct("meeting-notes"));
  if (rec.length >= 2) {
    return pick([
      `${rec.length} tools recording every call. Zero people rewatching them.`,
      `${rec[0]} and ${rec[1]} both joined the meeting. Neither took the action items.`,
    ]);
  }
  if (hasGap("crm")) {
    return pick([
      "No CRM. The pipeline lives in a spreadsheet called final_v3.",
      "No CRM. Bold choice. The forecast is a feeling.",
    ]);
  }
  if (hasGap("outreach")) return "All that data and no way to send an email.";
  if (hasGap("data")) return "Sequences loaded, nobody to send them to.";
  if (wasteHigh >= 20000) return `About ${money(wasteHigh)} a year on tools doing each other's jobs.`;
  const anyDirect = overlaps.find((o) => o.severity === "direct");
  if (anyDirect) {
    const names = anyDirect.tools.filter((t) => t.primary).map((t) => name(t.id));
    return `${names[0]} and ${names[1]} do the same job. One of them knows it.`;
  }
  if (n >= 15) return `${n} tools. The renewal calendar is a full-time job.`;
  if (grade === "A") {
    return pick([
      "Suspiciously clean. Who let RevOps finish a project?",
      "One tool per job. Procurement sends its regards.",
      "Nothing to roast. Annoying.",
    ]);
  }
  if (n <= 3) return "Lean stack. Either very disciplined or very new.";
  if (grade === "B") return "Solid stack. One impulse purchase away from a mess.";
  return "It works. Nobody is sure exactly why.";
}
