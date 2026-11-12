import type { Metadata } from "next";
import { CategoryTag } from "@/components/Tag";
import { CATEGORIES } from "@/lib/taxonomy";
import { TOOLS } from "@/lib/tools";
import type { Tool } from "@/lib/types";

export const metadata: Metadata = { title: "Tool database | stack.here" };

function price(t: Tool): string {
  const p = t.pricing;
  if (p.status === "not_public") return "Pricing not public";
  if (p.status === "unverified") return "Pricing not verified";
  if (p.amount == null) return "No fixed price";
  if (p.amount === 0) return "Usage-based, starts at $0";
  const sym = p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : (p.currency ?? "") + " ";
  return `${sym}${p.amount}${p.unit === "seat/month" ? "/seat/mo" : p.unit === "month" ? "/mo" : ""}`;
}

export default function ToolsPage() {
  const groups = Object.keys(CATEGORIES)
    .map((c) => ({ c, tools: TOOLS.filter((t) => t.category === c).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.tools.length);
  const publicCount = TOOLS.filter((t) => t.pricing.status === "public").length;

  return (
    <div className="pt-6">
      <h1 className="text-5xl font-black tracking-tighter sm:text-6xl">Tool database</h1>
      <p className="mt-4 max-w-2xl text-lg text-black/70">
        {TOOLS.length} GTM tools. {publicCount} have a public list price, read from the vendor's own site and linked
        below. Prices show the lowest paid plan and were last checked on {TOOLS[0]?.pricing.checkedOn}. Where a vendor
        doesn't publish a price, we say so and never guess.
      </p>
      <div className="mt-10 space-y-12">
        {groups.map(({ c, tools }) => (
          <section key={c}>
            <h2 className="mb-3 flex items-center gap-3 text-2xl font-black tracking-tight">
              {CATEGORIES[c].label} <span className="text-base font-bold text-black/40">{tools.length}</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.id} className="border-t border-black/10 align-top">
                      <td className="w-48 py-2.5 pr-3 font-bold">
                        <a href={t.website} target="_blank" rel="noreferrer" className="hover:underline">
                          {t.name}
                        </a>
                      </td>
                      <td className="w-44 py-2.5 pr-3">
                        <CategoryTag category={t.category} />
                      </td>
                      <td className="py-2.5 pr-3 text-black/75">{t.bestAt}</td>
                      <td className="w-56 py-2.5 text-black/75">
                        {t.pricing.sourceUrl ? (
                          <a href={t.pricing.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                            {price(t)}
                          </a>
                        ) : (
                          price(t)
                        )}
                        {t.pricing.status === "public" && t.pricing.note && (
                          <span className="mt-0.5 block text-xs text-black/50">{t.pricing.note}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
