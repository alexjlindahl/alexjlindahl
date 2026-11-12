import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CutForm } from "@/components/CutForm";
import { ShareBar } from "@/components/ShareBar";
import { CategoryTag, ToolTag } from "@/components/Tag";
import { DEFAULT_SEATS, percentile } from "@/lib/grade";
import { money, siteUrl } from "@/lib/site";
import { CUT_REASONS, getLearnedRules, getSubmission } from "@/lib/store";
import { TOOLS, getTool, toolName } from "@/lib/tools";
import type { Tool } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const sub = await getSubmission(id);
  if (!sub) return { title: "Stack not found | stack.here" };
  const r = sub.result;
  const title = `GTM stack grade: ${r.grade} | stack.here`;
  const image = `/s/${id}/card.png`;
  return {
    title,
    description: r.roast,
    openGraph: { title, description: r.roast, images: [{ url: image, width: 1200, height: 630 }], type: "website" },
    twitter: { card: "summary_large_image", title, description: r.roast, images: [image] },
  };
}

const GRADE_BG: Record<string, string> = { A: "#16A34A", B: "#65A30D", C: "#CA8A04", D: "#EA580C", F: "#DC2626" };

function priceLabel(t: Tool): string {
  const p = t.pricing;
  if (p.status === "not_public") return "pricing not public";
  if (p.status === "unverified") return "pricing not verified";
  if (p.amount == null) return p.note || "no fixed price";
  if (p.amount === 0) return "usage-based, starts at $0";
  const sym = p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : (p.currency ?? "") + " ";
  return `${sym}${p.amount}${p.unit === "seat/month" ? "/seat/mo" : p.unit === "month" ? "/mo" : ""}${p.plan ? ` (${p.plan})` : ""}`;
}

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-5 flex items-baseline gap-3 text-3xl font-black tracking-tight sm:text-4xl">
      <span className="text-base font-bold text-black/40">0{n}</span>
      {children}
    </h2>
  );
}

export default async function ResultPage({ params }: Props) {
  const { id } = await params;
  const sub = await getSubmission(id);
  if (!sub) notFound();
  const r = sub.result;
  const tools = r.tools.map(getTool).filter((t): t is Tool => !!t);
  const pct = percentile(r.score, await getLearnedRules());
  const url = `${siteUrl()}/s/${id}`;
  const direct = r.overlaps.filter((o) => o.severity === "direct");
  const partial = r.overlaps.filter((o) => o.severity === "partial");

  return (
    <div className="space-y-16 pt-6">
      {/* 1. Grade */}
      <section className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
        <div
          className="flex h-48 w-48 items-center justify-center rounded-3xl text-[9rem] font-black leading-none text-white sm:h-56 sm:w-56 sm:text-[11rem]"
          style={{ background: GRADE_BG[r.grade] }}
          aria-label={`Grade ${r.grade}`}
        >
          {r.grade}
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-black/50">
            Stack grade · {r.score}/100
            {pct != null && ` · beats ${pct}% of stacks`}
          </p>
          <p className="mt-2 text-3xl font-black leading-tight tracking-tight sm:text-4xl">{r.roast}</p>
          <ul className="mt-5 space-y-1.5 text-lg">
            {r.explanation.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-black" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap gap-2">
          {tools.map((t) => (
            <ToolTag key={t.id} name={t.name} category={t.category} />
          ))}
        </div>
        <p className="mt-3 text-sm text-black/60">
          {tools.length} tool{tools.length === 1 ? "" : "s"} recognized
          {r.teamSize ? ` · team of ${r.teamSize}` : ` · no team size given, assuming ${DEFAULT_SEATS} seats`}
          {r.unknown.length > 0 && ` · not recognized (ignored): ${r.unknown.join(", ")}`}
        </p>
      </section>

      {/* 2. Overlaps */}
      <section>
        <SectionTitle n={1}>Overlaps</SectionTitle>
        {r.overlaps.length === 0 && <p className="text-lg">None. Every tool has its own job.</p>}
        <div className="space-y-5">
          {[...direct, ...partial].map((o) => (
            <div key={o.job} className="rounded-2xl border-2 border-black p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-black">{o.jobLabel}</h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${
                    o.severity === "direct" ? "bg-black text-white" : "border border-black"
                  }`}
                >
                  {o.severity === "direct" ? "Direct overlap" : "Partial overlap"}
                </span>
              </div>
              <p className="mt-2 text-black/75">{o.advice}</p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {o.tools.map(({ id: tid, primary }) => {
                  const t = getTool(tid);
                  if (!t) return null;
                  return (
                    <div key={tid} className="rounded-xl bg-black/[0.04] p-3.5">
                      <dt className="flex flex-wrap items-center gap-2">
                        <ToolTag name={t.name} category={t.category} />
                        {!primary && <span className="text-xs font-medium text-black/50">side feature</span>}
                      </dt>
                      <dd className="mt-2 text-sm">
                        <span className="font-bold">Best at:</span> {t.bestAt}
                        <span className="mt-1 block text-black/55">{priceLabel(t)}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Wasted spend */}
      <section>
        <SectionTitle n={2}>Wasted spend</SectionTitle>
        <div className="rounded-2xl bg-black p-6 text-white sm:p-8">
          <p className="inline-block rounded-full bg-yellow-300 px-3 py-1 text-xs font-black uppercase tracking-wide text-black">
            Estimate, not an audit
          </p>
          <p className="mt-4 text-5xl font-black tracking-tighter sm:text-7xl">
            {r.waste.high > 0 ? `${money(r.waste.low)} to ${money(r.waste.high)}` : direct.length ? "Can't price it" : "$0"}
            {r.waste.high > 0 && <span className="text-2xl font-bold tracking-normal text-white/60"> / year</span>}
          </p>
          <p className="mt-3 max-w-2xl text-white/75">
            {r.waste.high > 0
              ? "What duplicate tools cost at public list prices."
              : direct.length
                ? "There are direct overlaps, but none of the duplicate tools publish a price we could use."
                : "No two tools in this stack are bought for the same main job."}
          </p>
        </div>
        {r.waste.items.length > 0 && (
          <table className="mt-5 w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-black text-xs uppercase tracking-wide">
                <th className="py-2 pr-3">Duplicate tool</th>
                <th className="py-2 pr-3">How it was counted</th>
                <th className="py-2 text-right">Per year</th>
              </tr>
            </thead>
            <tbody>
              {r.waste.items.map((i) => {
                const t = getTool(i.toolId);
                return (
                  <tr key={i.toolId} className="border-b border-black/10">
                    <td className="py-2.5 pr-3 font-bold">{toolName(i.toolId)}</td>
                    <td className="py-2.5 pr-3 text-black/70">
                      {i.basis}
                      {t?.pricing.sourceUrl && (
                        <>
                          {" · "}
                          <a href={t.pricing.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                            source
                          </a>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums">{money(i.annual)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {r.waste.excluded.length > 0 && (
          <p className="mt-4 text-sm">
            <span className="font-bold">Not counted:</span>{" "}
            {r.waste.excluded.map((e) => `${toolName(e.toolId)} (${e.reason})`).join(", ")}.
          </p>
        )}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-black/60">
          {r.waste.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
          <li>
            For scale: the {r.knownSpend.pricedTools} tool{r.knownSpend.pricedTools === 1 ? "" : "s"} here with a
            usable public price come to about {money(r.knownSpend.annual)} a year at entry-plan list prices
            {r.knownSpend.unpricedTools > 0 && `; ${r.knownSpend.unpricedTools} more have no public price`}.
          </li>
        </ul>
      </section>

      {/* 4. Gaps */}
      <section>
        <SectionTitle n={3}>Gaps</SectionTitle>
        {r.gaps.length === 0 && <p className="text-lg">None for a team this size.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {r.gaps.map((g) => (
            <div key={g.id} className="rounded-2xl border-2 border-dashed border-black/50 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-black">{g.label}</h3>
                {g.tier === "core" && (
                  <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                    Core
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-black/75">{g.why}</p>
              {g.examples.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-black/50">Tools that do this:</span>
                  {g.examples.map((eid) => {
                    const t = getTool(eid);
                    return t ? <ToolTag key={eid} name={t.name} category={t.category} /> : null;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 5. Share card */}
      <section>
        <SectionTitle n={4}>Share it</SectionTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/s/${id}/card.png`}
          alt={`Share card: grade ${r.grade}. ${r.roast}`}
          width={1200}
          height={630}
          className="w-full max-w-3xl rounded-2xl border-2 border-black"
        />
        <ShareBar url={url} cardUrl={`/s/${id}/card.png`} grade={r.grade} />
      </section>

      {/* Tool details */}
      <section>
        <SectionTitle n={5}>Your tools</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b-2 border-black text-xs uppercase tracking-wide">
                <th className="py-2 pr-3">Tool</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Best at</th>
                <th className="py-2">List price</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.id} className="border-b border-black/10 align-top">
                  <td className="py-2.5 pr-3 font-bold">{t.name}</td>
                  <td className="py-2.5 pr-3">
                    <CategoryTag category={t.category} />
                  </td>
                  <td className="py-2.5 pr-3 text-black/75">{t.bestAt}</td>
                  <td className="py-2.5 text-black/75">
                    {t.pricing.sourceUrl ? (
                      <a href={t.pricing.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                        {priceLabel(t)}
                      </a>
                    ) : (
                      priceLabel(t)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cut a tool */}
      <section className="rounded-2xl bg-black/[0.04] p-6 sm:p-8">
        <h2 className="text-2xl font-black tracking-tight">Cut a tool lately?</h2>
        <p className="mt-1 text-black/70">
          Tell us what you dropped and why. It is anonymous, and it is how the grades get better.
        </p>
        <CutForm
          submissionId={id}
          stackTools={tools.map((t) => ({ id: t.id, name: t.name }))}
          allTools={TOOLS.map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name))}
          reasons={CUT_REASONS}
        />
      </section>

      <p>
        <Link href="/" className="text-lg font-black underline underline-offset-4">
          Grade another stack
        </Link>
      </p>
    </div>
  );
}
