import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TakeCard } from "@/components/TakeCard";
import { addDays, formatDay, isDay, today } from "@/lib/dates";
import { controversyScore, pickHeadlines } from "@/lib/scoring";
import { getDay } from "@/lib/takes";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ day: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  return { title: isDay(day) ? `Results for ${formatDay(day, { month: "long", day: "numeric", year: "numeric" })}` : "Results" };
}

export default async function ResultsPage({ params }: Props) {
  const { day } = await params;
  const now = today();
  if (!isDay(day) || day > now) notFound();
  const takes = await getDay(day);
  if (takes.length === 0) notFound();

  const live = day === now;
  const { divisive, agreed, rejected } = pickHeadlines(takes);
  const headline = new Set([divisive, agreed, rejected].filter(Boolean));
  const rest = takes.filter((t) => !headline.has(t)).sort((a, b) => controversyScore(b.counts) - controversyScore(a.counts));
  const votes = takes.reduce((n, t) => n + t.counts.hot + t.counts.not + t.counts.depends, 0);

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-muted">{live ? "Live results · voting open until midnight" : "Final results"}</p>
      <h1 className="font-display text-4xl leading-none sm:text-5xl">{formatDay(day, { weekday: "long", month: "short", day: "numeric" })}</h1>
      <p className="mt-2 text-sm text-muted">
        {votes.toLocaleString("en-US")} votes across {takes.length} takes.{" "}
        {live && (
          <Link href="/" className="font-bold text-ink underline">
            Cast yours
          </Link>
        )}
      </p>

      {!divisive ? (
        <p className="pop mt-6 bg-white p-5 font-bold">No votes yet. Be the first.</p>
      ) : (
        <section className="mt-6 grid gap-5">
          <TakeCard take={divisive} badge="Most divisive" tone="depends" />
          <div className="grid gap-5 sm:grid-cols-2">
            {agreed && <TakeCard take={agreed} badge="Most agreed" tone="hot" />}
            {rejected && <TakeCard take={rejected} badge="Most rejected" tone="not" />}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-2xl">The rest, closest splits first</h2>
          <div className="grid gap-5">
            {rest.map((t) => (
              <TakeCard key={t.id} take={t} />
            ))}
          </div>
        </section>
      )}

      <nav className="mt-10 flex justify-between text-sm font-bold">
        <Link href={`/results/${addDays(day, -1)}`} className="underline">
          ← Previous day
        </Link>
        {!live && (
          <Link href={`/results/${addDays(day, 1)}`} className="underline">
            Next day →
          </Link>
        )}
      </nav>
    </div>
  );
}
