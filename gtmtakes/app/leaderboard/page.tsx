import type { Metadata } from "next";
import { TakeCard } from "@/components/TakeCard";
import { formatDay, monthOf, today } from "@/lib/dates";
import { monthLeaderboard } from "@/lib/takes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Most controversial takes of the month" };

export default async function Leaderboard() {
  const now = today();
  const takes = await monthLeaderboard(monthOf(now), now, 20);
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-muted">Running leaderboard · updates with every vote</p>
      <h1 className="font-display text-4xl leading-none sm:text-5xl">Most controversial takes of {formatDay(now, { month: "long" })}</h1>
      <p className="mt-2 text-sm text-muted">Ranked by how close the Hot/Not split is to 50/50, weighted by how many people voted.</p>
      {takes.length === 0 && <p className="pop mt-6 bg-white p-5 font-bold">No votes yet this month.</p>}
      <ol className="mt-6 grid gap-5">
        {takes.map((t, i) => (
          <li key={t.id}>
            <TakeCard take={t} rank={i + 1} tone={i === 0 ? "depends" : "white"} badge={t.day ? formatDay(t.day, { month: "short", day: "numeric" }) : undefined} />
          </li>
        ))}
      </ol>
    </div>
  );
}
