import type { Metadata } from "next";
import Link from "next/link";
import { formatDay, monthOf, today } from "@/lib/dates";
import { pickHeadlines, split } from "@/lib/scoring";
import { getRange, listDays } from "@/lib/takes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Archive" };

export default async function Archive() {
  const now = today();
  const days = (await listDays(now)).filter((d) => d.day < now);
  const takes = days.length ? await getRange(days[days.length - 1].day, days[0].day) : [];

  return (
    <div>
      <h1 className="font-display text-4xl leading-none sm:text-5xl">Archive</h1>
      <p className="mt-2 text-sm text-muted">
        Every past day, with the take that split people the most.{" "}
        <Link href="/leaderboard" className="font-bold text-ink underline">
          Most controversial takes of {formatDay(now, { month: "long" })} →
        </Link>
      </p>
      {days.length === 0 && <p className="pop mt-6 bg-white p-5 font-bold">No finished days yet. Come back tomorrow.</p>}
      <ul className="mt-6 grid gap-4">
        {days.map((d, i) => {
          const dayTakes = takes.filter((t) => t.day === d.day);
          const { divisive } = pickHeadlines(dayTakes);
          const votes = dayTakes.reduce((n, t) => n + t.counts.hot + t.counts.not + t.counts.depends, 0);
          const newMonth = i === 0 || monthOf(days[i - 1].day) !== monthOf(d.day);
          return (
            <li key={d.day}>
              {newMonth && <h2 className="mb-3 mt-4 font-display text-xl text-muted">{formatDay(d.day, { month: "long", year: "numeric" })}</h2>}
              <Link href={`/results/${d.day}`} className="pop press block bg-white p-4 hover:bg-depends sm:p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-xl">{formatDay(d.day, { weekday: "long", month: "short", day: "numeric" })}</span>
                  <span className="shrink-0 text-xs font-bold text-muted">
                    {d.takes} takes · {votes.toLocaleString("en-US")} votes
                  </span>
                </div>
                {divisive && (
                  <p className="mt-2 text-sm">
                    <span className="font-bold">Most divisive:</span> {divisive.statement}{" "}
                    <span className="whitespace-nowrap font-bold">
                      (<span className="text-hot">{split(divisive.counts).hotPct}% Hot</span> / <span className="text-not">{split(divisive.counts).notPct}% Not</span>)
                    </span>
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
