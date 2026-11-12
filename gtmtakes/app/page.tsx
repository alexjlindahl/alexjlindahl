import { cookies } from "next/headers";
import Link from "next/link";
import { VoteDeck, type DeckTake } from "@/components/VoteDeck";
import { formatDay, today } from "@/lib/dates";
import { ensureToday } from "@/lib/takes";
import { VOTER_COOKIE, votesByVoter } from "@/lib/votes";

export const dynamic = "force-dynamic";

export default async function Home() {
  const day = today();
  const takes = await ensureToday();
  const voter = (await cookies()).get(VOTER_COOKIE)?.value;
  const mine = await votesByVoter(voter, takes.map((t) => t.id));

  if (takes.length === 0) {
    return (
      <div className="pop bg-white p-6 text-center">
        <h1 className="font-display text-3xl">No takes today</h1>
        <p className="mt-2">Nothing is scheduled and the approved pool is empty.</p>
        <Link href="/archive" className="mt-4 inline-block font-bold underline">
          Browse the archive
        </Link>
      </div>
    );
  }

  // Author and source stay hidden until the vote is in, so people react to the idea.
  const deck: DeckTake[] = takes.map((t) => {
    const voted = mine[t.id];
    return {
      id: t.id,
      statement: t.statement,
      topic: t.topic,
      result: voted ? { choice: voted, counts: t.counts, handle: t.author_handle, url: t.source_url } : null,
      reveal: { handle: t.author_handle, url: t.source_url },
    };
  });

  return <VoteDeck takes={deck} day={day} dayLabel={formatDay(day, { weekday: "long", month: "short", day: "numeric" })} />;
}
