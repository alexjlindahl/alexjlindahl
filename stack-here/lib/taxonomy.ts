/** Categories (the colored tags) and jobs (what overlap and gap rules reason about). */

export interface Category {
  label: string;
  /** Tag colors: background and text. Used on the site and on the share card. */
  bg: string;
  fg: string;
}

export const CATEGORIES: Record<string, Category> = {
  "data-enrichment": { label: "Data & enrichment", bg: "#DBEAFE", fg: "#1E3A8A" },
  crm: { label: "CRM", bg: "#FEE2E2", fg: "#991B1B" },
  sequencing: { label: "Sequencing", bg: "#DCFCE7", fg: "#166534" },
  calling: { label: "Calling", bg: "#FFEDD5", fg: "#9A3412" },
  intelligence: { label: "Intelligence", bg: "#EDE9FE", fg: "#5B21B6" },
  intent: { label: "Intent & signals", bg: "#FCE7F3", fg: "#9D174D" },
  automation: { label: "Automation", bg: "#FEF9C3", fg: "#854D0E" },
  "ai-sdr": { label: "AI SDR", bg: "#CFFAFE", fg: "#155E75" },
  analytics: { label: "Analytics", bg: "#E0E7FF", fg: "#3730A3" },
  scheduling: { label: "Scheduling", bg: "#CCFBF1", fg: "#115E59" },
  "marketing-automation": { label: "Marketing automation", bg: "#FAE8FF", fg: "#86198F" },
  abm: { label: "ABM", bg: "#FFE4E6", fg: "#9F1239" },
  chat: { label: "Chat", bg: "#D1FAE5", fg: "#065F46" },
  enablement: { label: "Enablement", bg: "#FEF3C7", fg: "#92400E" },
  "deal-desk": { label: "Deal desk", bg: "#E2E8F0", fg: "#1E293B" },
  "customer-success": { label: "Customer success", bg: "#ECFCCB", fg: "#3F6212" },
  "data-infra": { label: "Data infrastructure", bg: "#E0F2FE", fg: "#075985" },
  revops: { label: "RevOps", bg: "#F3E8FF", fg: "#6B21A8" },
  "email-infra": { label: "Email infrastructure", bg: "#F1F5F9", fg: "#334155" },
  "social-selling": { label: "LinkedIn automation", bg: "#BFDBFE", fg: "#1E40AF" },
  engagement: { label: "Video, gifting & events", bg: "#FED7AA", fg: "#7C2D12" },
};

export function categoryOf(id: string): Category {
  return CATEGORIES[id] ?? { label: id, bg: "#F1F5F9", fg: "#334155" };
}

export interface JobRule {
  label: string;
  /**
   * "single": one tool should own this job; two tools whose main job is this are a direct overlap.
   * "multi": teams reasonably run several (no flag).
   */
  mode: "single" | "multi";
  /** Score penalty for each redundant tool in a direct overlap. */
  weight: number;
}

export const JOBS: Record<string, JobRule> = {
  "contact-data": { label: "Contact data", mode: "single", weight: 6 },
  "company-data": { label: "Company data", mode: "single", weight: 4 },
  enrichment: { label: "Record enrichment", mode: "single", weight: 4 },
  "waterfall-enrichment": { label: "Waterfall enrichment", mode: "single", weight: 6 },
  "email-finding": { label: "Email finding", mode: "single", weight: 4 },
  "email-verification": { label: "Email verification", mode: "single", weight: 3 },
  "phone-data": { label: "Phone numbers", mode: "single", weight: 4 },
  technographics: { label: "Technographics", mode: "single", weight: 3 },
  crm: { label: "CRM", mode: "single", weight: 12 },
  "marketing-automation": { label: "Marketing automation", mode: "single", weight: 8 },
  "sales-engagement": { label: "Sales sequences", mode: "single", weight: 8 },
  "cold-email": { label: "Cold email sending", mode: "single", weight: 6 },
  "email-deliverability": { label: "Email warmup & deliverability", mode: "single", weight: 3 },
  "linkedin-automation": { label: "LinkedIn automation", mode: "single", weight: 5 },
  "email-writing-ai": { label: "AI email writing", mode: "single", weight: 3 },
  dialer: { label: "Sales dialer", mode: "single", weight: 6 },
  "business-phone": { label: "Business phone", mode: "single", weight: 5 },
  "conversation-intelligence": { label: "Call recording & conversation intelligence", mode: "single", weight: 7 },
  "meeting-notes": { label: "AI meeting notes", mode: "single", weight: 5 },
  forecasting: { label: "Forecasting", mode: "single", weight: 6 },
  "deal-management": { label: "Pipeline & deal management", mode: "single", weight: 4 },
  "intent-data": { label: "Intent data", mode: "single", weight: 5 },
  "visitor-id": { label: "Website visitor identification", mode: "single", weight: 5 },
  "signal-tracking": { label: "Buying-signal tracking", mode: "single", weight: 4 },
  abm: { label: "ABM platform", mode: "single", weight: 7 },
  "workflow-automation": { label: "Workflow automation", mode: "single", weight: 4 },
  "data-orchestration": { label: "GTM data orchestration", mode: "single", weight: 5 },
  "ai-sdr": { label: "AI SDR agent", mode: "single", weight: 7 },
  "product-analytics": { label: "Product analytics", mode: "single", weight: 5 },
  bi: { label: "BI & dashboards", mode: "single", weight: 4 },
  attribution: { label: "Attribution", mode: "single", weight: 5 },
  scheduling: { label: "Meeting scheduling", mode: "single", weight: 4 },
  "lead-routing": { label: "Lead routing", mode: "single", weight: 5 },
  chat: { label: "Website chat", mode: "single", weight: 5 },
  "sales-enablement": { label: "Sales enablement content", mode: "single", weight: 6 },
  "sales-coaching": { label: "Sales coaching & roleplay", mode: "single", weight: 4 },
  "digital-sales-room": { label: "Digital sales rooms", mode: "single", weight: 4 },
  "interactive-demo": { label: "Interactive demos", mode: "single", weight: 4 },
  "e-signature": { label: "E-signature", mode: "single", weight: 4 },
  proposals: { label: "Proposals & quotes", mode: "single", weight: 4 },
  cpq: { label: "CPQ", mode: "single", weight: 6 },
  "customer-success": { label: "Customer success platform", mode: "single", weight: 7 },
  cdp: { label: "Customer data platform", mode: "single", weight: 6 },
  "reverse-etl": { label: "Reverse ETL", mode: "single", weight: 5 },
  "data-hygiene": { label: "CRM data hygiene", mode: "single", weight: 3 },
  commissions: { label: "Commissions", mode: "single", weight: 6 },
  "partner-ecosystem": { label: "Partner data", mode: "single", weight: 4 },
  "video-messaging": { label: "Video messaging", mode: "single", weight: 3 },
  gifting: { label: "Gifting", mode: "single", weight: 4 },
  webinars: { label: "Webinars & events", mode: "single", weight: 4 },
  "web-personalization": { label: "Website personalization", mode: "single", weight: 4 },
};

export function jobLabel(id: string): string {
  return JOBS[id]?.label ?? id;
}

export interface Capability {
  id: string;
  label: string;
  /** Any of these jobs covers the capability. */
  jobs: string[];
  tier: "core" | "recommended";
  /** Recommended capabilities only apply from this team size up. */
  minTeam: number;
  why: string;
  /** Tool ids suggested as examples (filtered to ones that exist in the database). */
  examples: string[];
}

export const CAPABILITIES: Capability[] = [
  {
    id: "crm",
    label: "CRM",
    jobs: ["crm"],
    tier: "core",
    minTeam: 0,
    why: "Nothing else in the stack has a system of record to write to.",
    examples: ["hubspot", "salesforce", "attio", "pipedrive"],
  },
  {
    id: "data",
    label: "Contact & company data",
    jobs: ["contact-data", "waterfall-enrichment", "enrichment", "data-orchestration", "email-finding", "company-data"],
    tier: "core",
    minTeam: 0,
    why: "Reps are building lists by hand or working stale records.",
    examples: ["clay", "apollo", "zoominfo", "cognism"],
  },
  {
    id: "outreach",
    label: "Outbound sequencing",
    jobs: ["sales-engagement", "cold-email", "ai-sdr"],
    tier: "core",
    minTeam: 0,
    why: "There is no tool for running and tracking outbound at volume.",
    examples: ["outreach", "salesloft", "instantly", "smartlead", "lemlist"],
  },
  {
    id: "call-capture",
    label: "Call recording or meeting notes",
    jobs: ["conversation-intelligence", "meeting-notes"],
    tier: "recommended",
    minTeam: 3,
    why: "What customers say on calls stays in people's heads.",
    examples: ["gong", "fathom", "fireflies", "avoma"],
  },
  {
    id: "scheduling",
    label: "Meeting scheduling",
    jobs: ["scheduling", "lead-routing"],
    tier: "recommended",
    minTeam: 3,
    why: "Booking a meeting takes an email thread.",
    examples: ["calendly", "chili-piper", "cal-com"],
  },
  {
    id: "automation",
    label: "Workflow automation",
    jobs: ["workflow-automation", "data-orchestration"],
    tier: "recommended",
    minTeam: 6,
    why: "Tools are connected by copy-paste or not at all.",
    examples: ["clay", "zapier", "make", "n8n"],
  },
  {
    id: "signals",
    label: "Intent or buying signals",
    jobs: ["intent-data", "visitor-id", "signal-tracking", "abm"],
    tier: "recommended",
    minTeam: 10,
    why: "Outbound is timed by the calendar, not by what accounts are doing.",
    examples: ["common-room", "rb2b", "6sense", "usergems"],
  },
  {
    id: "analytics",
    label: "Reporting or attribution",
    jobs: ["bi", "attribution", "product-analytics", "forecasting"],
    tier: "recommended",
    minTeam: 15,
    why: "Pipeline questions get answered from CRM exports.",
    examples: ["hockeystack", "tableau", "looker", "clari"],
  },
  {
    id: "enablement",
    label: "Enablement or coaching",
    jobs: ["sales-enablement", "sales-coaching", "digital-sales-room"],
    tier: "recommended",
    minTeam: 40,
    why: "At this size, onboarding and content need a home.",
    examples: ["highspot", "seismic", "mindtickle", "hyperbound"],
  },
];
