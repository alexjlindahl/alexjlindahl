import Link from "next/link";
import { TOPIC_LABELS } from "@/lib/scoring";
import type { TakeWithCounts } from "@/lib/takes";
import { SplitBar } from "./SplitBar";

export function SourceLink({ take, className = "" }: { take: Pick<TakeWithCounts, "source_url" | "author_handle">; className?: string }) {
  return (
    <a href={take.source_url} target="_blank" rel="noopener noreferrer" className={`font-bold underline decoration-2 underline-offset-2 hover:text-hot ${className}`}>
      Original post by @{take.author_handle} on X ↗
    </a>
  );
}

/** A take with its result: used on results, archive and leaderboard pages. */
export function TakeCard({ take, badge, tone = "white", rank }: { take: TakeWithCounts; badge?: string; tone?: "white" | "hot" | "not" | "depends"; rank?: number }) {
  const bg = { white: "bg-white", hot: "bg-hot-soft", not: "bg-not-soft", depends: "bg-depends" }[tone];
  return (
    <article className={`pop ${bg} p-4 sm:p-5`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide">
        {rank != null && <span className="font-display text-2xl leading-none">#{rank}</span>}
        {badge && <span className="rounded-full bg-ink px-2.5 py-1 text-paper">{badge}</span>}
        <span className="rounded-full border-2 border-ink px-2 py-0.5">{TOPIC_LABELS[take.topic] ?? take.topic}</span>
      </div>
      <h3 className="font-display text-xl leading-tight sm:text-2xl">
        <Link href={`/take/${take.id}`} className="hover:underline">
          {take.statement}
        </Link>
      </h3>
      <div className="mt-4">
        <SplitBar counts={take.counts} />
      </div>
      <p className="mt-3 text-sm">
        <SourceLink take={take} />
      </p>
    </article>
  );
}
