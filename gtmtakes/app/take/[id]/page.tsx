import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/CopyLink";
import { SplitBar } from "@/components/SplitBar";
import { SourceLink } from "@/components/TakeCard";
import { formatDay, today } from "@/lib/dates";
import { split, TOPIC_LABELS } from "@/lib/scoring";
import { SITE_URL } from "@/lib/site";
import { getTake } from "@/lib/takes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function load(params: Props["params"]) {
  const { id } = await params;
  const take = /^\d+$/.test(id) ? await getTake(Number(id)) : undefined;
  // Only takes that have gone live are public.
  if (!take || !take.day || take.day > today()) return null;
  return take;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const take = await load(params);
  if (!take) return {};
  const s = split(take.counts);
  const description = s.decided > 0 ? `${s.hotPct}% Hot, ${s.notPct}% Not. Where do you land?` : "Hot or not? Cast your vote.";
  const image = { url: `/api/card/${take.id}`, width: 1200, height: 630, alt: take.statement };
  return {
    title: take.statement,
    description,
    openGraph: { title: take.statement, description, images: [image], type: "article" },
    twitter: { card: "summary_large_image", title: take.statement, description, images: [image.url] },
  };
}

export default async function TakePage({ params }: Props) {
  const take = await load(params);
  if (!take) notFound();
  const open = take.day === today();
  const url = `${SITE_URL}/take/${take.id}`;
  const s = split(take.counts);
  const shareText = s.decided > 0 ? `"${take.statement}" ${s.hotPct}% Hot / ${s.notPct}% Not on gtmtakes.here` : `"${take.statement}" Hot or not?`;

  return (
    <div className="mx-auto max-w-xl">
      <article className="pop bg-white p-5 sm:p-7">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide">
          <span className="rounded-full border-2 border-ink px-2.5 py-0.5">{TOPIC_LABELS[take.topic] ?? take.topic}</span>
          <Link href={`/results/${take.day}`} className="text-muted underline">
            {formatDay(take.day!, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </Link>
        </div>
        <h1 className="font-display text-3xl leading-[1.08] text-balance sm:text-4xl">{take.statement}</h1>
        <div className="mt-6">
          <SplitBar counts={take.counts} size="lg" />
        </div>
        <p className="mt-4 text-sm">
          <SourceLink take={take} />
        </p>
      </article>

      {open && (
        <Link href="/" className="pop press mt-5 block bg-ink py-4 text-center font-display text-xl text-paper">
          Vote on today&apos;s takes →
        </Link>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl">Share this take</h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated on demand, not a static asset */}
        <img src={`/api/card/${take.id}`} alt={`Share card: ${take.statement}`} width={1200} height={630} className="pop-sm mt-3 h-auto w-full" />
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
          <a href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className="pop-sm press bg-white px-4 py-2.5">
            Post on X
          </a>
          <a href={`/api/card/${take.id}?download=1`} className="pop-sm press bg-white px-4 py-2.5">
            Download PNG
          </a>
          <CopyLink url={url} />
        </div>
      </section>
    </div>
  );
}
