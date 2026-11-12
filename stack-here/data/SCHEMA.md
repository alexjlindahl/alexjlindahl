# tools.json schema

Each entry:

```json
{
  "id": "apollo",                       // kebab-case, unique
  "name": "Apollo.io",                  // official product name
  "aliases": ["apollo", "apollo io"],   // lowercase: common spellings, abbreviations, former names, typos people really make
  "category": "data-enrichment",        // ONE primary category from the list below
  "jobs": ["contact-data", "sales-engagement"], // 1-4 job ids from the list below, primary job first; only jobs teams really buy it for
  "bestAt": "Cheap all-in-one contact database plus sequencing for SMB outbound", // <= 90 chars, concrete, vs. its peers
  "website": "https://www.apollo.io",
  "pricing": {
    "status": "public",                 // "public" | "not_public" | "unverified"
    "amount": 49,                       // number or null. Lowest-priced PAID plan on the vendor's page.
    "currency": "USD",                  // currency shown on the page, or null
    "unit": "seat/month",               // "seat/month" (per user) | "month" (flat plan / usage plan) | null
    "plan": "Basic",                    // plan name or null
    "billing": "annual",                // "annual" | "monthly" | null — the billing term the amount reflects (prefer the annual-billing monthly-equivalent when both are shown)
    "hasFreeTier": true,
    "note": "Basic plan, billed annually; credit limits apply",
    "sourceUrl": "https://www.apollo.io/pricing", // exact page where the price was read
    "checkedOn": "2026-11-12"
  }
}
```

Pricing rules (strict):
- `status: "public"` only if the number was read on the vendor's own website this research pass. `sourceUrl` is that page.
- `status: "not_public"` when the vendor's pricing page says contact sales / custom quote / has no pricing page. amount null, note "pricing not public", sourceUrl = the vendor pricing page (or null).
- `status: "unverified"` when a price probably exists publicly but could not be read (JS-rendered page, blocked fetch). amount null, note "pricing not verified".
- Never estimate, never use third-party review-site numbers, never use remembered numbers.

Categories: data-enrichment, crm, sequencing, calling, intelligence, intent, automation, ai-sdr, analytics, scheduling,
marketing-automation, abm, chat, enablement, deal-desk, customer-success, data-infra, revops, email-infra, social-selling, engagement

Jobs: contact-data, company-data, enrichment, waterfall-enrichment, email-finding, email-verification, phone-data, technographics,
crm, marketing-automation, sales-engagement, cold-email, email-deliverability, linkedin-automation, email-writing-ai,
dialer, business-phone, conversation-intelligence, meeting-notes, forecasting, deal-management, intent-data, visitor-id,
signal-tracking, abm, workflow-automation, data-orchestration, ai-sdr, product-analytics, bi, attribution, scheduling,
lead-routing, chat, sales-enablement, sales-coaching, digital-sales-room, interactive-demo, e-signature, proposals, cpq,
customer-success, cdp, reverse-etl, data-hygiene, commissions, partner-ecosystem, video-messaging, gifting, webinars,
web-personalization
