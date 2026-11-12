import type { Metadata } from "next";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { formatDay } from "@/lib/dates";
import { featureLabel, TOPIC_LABELS, TOPICS } from "@/lib/scoring";
import { fitModel, getDay, LINEUP_SIZE, listByStatus, rankTakes, tomorrow, type RankedTake } from "@/lib/takes";
import { addToTomorrow, autoFillTomorrow, login, logout, removeFromTomorrow, reviewTake } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const btn = "pop-sm press px-3 py-1.5 text-sm font-bold";

export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!adminConfigured()) {
    return (
      <div className="pop bg-white p-6">
        <h1 className="font-display text-3xl">Admin is off</h1>
        <p className="mt-2">
          Set <code className="font-bold">ADMIN_PASSWORD</code> in <code>.env</code> and restart to enable this page.
        </p>
      </div>
    );
  }
  if (!(await isAdmin())) {
    const { error } = await searchParams;
    return (
      <form action={login} className="pop mx-auto max-w-sm bg-white p-6">
        <h1 className="font-display text-3xl">Admin</h1>
        <label className="mt-4 block text-sm font-bold" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" required autoFocus className="mt-1 w-full rounded-lg border-3 border-ink px-3 py-2" />
        {error && <p className="mt-2 text-sm font-bold text-hot">Wrong password.</p>}
        <button className={`${btn} mt-4 bg-ink text-paper`}>Sign in</button>
      </form>
    );
  }

  const day = tomorrow();
  const model = await fitModel();
  const [lineup, approved, candidates, rejected] = await Promise.all([getDay(day), listByStatus("approved"), listByStatus("candidate"), listByStatus("rejected")]);
  const pool = rankTakes(model, approved);
  const queue = rankTakes(model, candidates);
  const full = lineup.length >= LINEUP_SIZE;
  const patterns = [...model.patterns.values()].sort((a, b) => b.lift - a.lift);

  return (
    <div className="grid gap-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-none">Admin</h1>
          <p className="mt-2 text-sm text-muted">
            {queue.length} to review · {pool.length} approved and waiting · {rejected.length} rejected
          </p>
        </div>
        <form action={logout}>
          <button className={`${btn} bg-white`}>Sign out</button>
        </form>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl">
            Tomorrow&apos;s lineup <span className="text-muted">· {formatDay(day)} · {lineup.length}/{LINEUP_SIZE}</span>
          </h2>
          <form action={autoFillTomorrow}>
            <button disabled={full || pool.length === 0} className={`${btn} bg-depends disabled:opacity-40`}>
              Auto-fill with top-ranked takes
            </button>
          </form>
        </div>
        <p className="mt-1 text-sm text-muted">If you leave this empty, the site fills the day itself from the approved pool, best-ranked first.</p>
        <ol className="mt-4 grid gap-2">
          {lineup.map((t, i) => (
            <li key={t.id} className="pop-sm flex items-center gap-3 bg-white p-3">
              <span className="font-display text-lg">{i + 1}</span>
              <span className="flex-1 text-sm">
                <strong>{t.statement}</strong> <span className="text-muted">· {TOPIC_LABELS[t.topic]} · @{t.author_handle}</span>
              </span>
              <form action={removeFromTomorrow}>
                <input type="hidden" name="id" value={t.id} />
                <button className={`${btn} bg-white`}>Remove</button>
              </form>
            </li>
          ))}
          {lineup.length === 0 && <li className="rounded-lg border-2 border-dashed border-ink/40 p-4 text-sm">Nothing scheduled yet.</li>}
        </ol>
      </section>

      <section>
        <h2 className="font-display text-2xl">Review queue</h2>
        <p className="mt-1 text-sm text-muted">New candidates from the pipeline. Check the rewrite against the original post, fix it if needed, then approve or reject.</p>
        <div className="mt-4 grid gap-4">
          {queue.map((t) => (
            <Review key={t.id} take={t} />
          ))}
          {queue.length === 0 && <p className="rounded-lg border-2 border-dashed border-ink/40 p-4 text-sm">Queue is empty. Run <code>npm run fetch-takes</code> to pull more.</p>}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl">Approved pool, ranked for debate</h2>
        <p className="mt-1 text-sm text-muted">Sorted by predicted divisiveness, learned from past votes (with a small bonus for untested topics and phrasings).</p>
        <ul className="mt-4 grid gap-2">
          {pool.map((t) => (
            <li key={t.id} className="pop-sm flex flex-wrap items-center gap-3 bg-white p-3">
              <span className="w-14 shrink-0 text-center font-display text-lg" title="Predicted divisiveness">
                {Math.round(t.predicted * 100)}
              </span>
              <span className="min-w-0 flex-1 basis-64 text-sm">
                <strong>{t.statement}</strong>{" "}
                <span className="text-muted">
                  · {TOPIC_LABELS[t.topic]} ·{" "}
                  <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                    @{t.author_handle}
                  </a>
                </span>
              </span>
              <form action={addToTomorrow}>
                <input type="hidden" name="id" value={t.id} />
                <button disabled={full} className={`${btn} bg-depends disabled:opacity-40`}>
                  Add to tomorrow
                </button>
              </form>
              <form action={reviewTake}>
                <input type="hidden" name="id" value={t.id} />
                <button name="status" value="candidate" className={`${btn} bg-white`}>
                  Back to review
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-2xl">What splits people</h2>
        <p className="mt-1 text-sm text-muted">
          Learned from {model.nTakes} voted takes. Average divisiveness {Math.round(model.mean * 100)} out of 100 (100 is a perfect 50/50 split). Lift is how far a pattern sits above or below that average.
        </p>
        <div className="pop-sm mt-4 overflow-x-auto bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b-3 border-ink text-xs uppercase tracking-wide">
              <tr>
                <th className="p-2.5">Pattern</th>
                <th className="p-2.5 text-right">Takes</th>
                <th className="p-2.5 text-right">Divisiveness</th>
                <th className="p-2.5 text-right">Lift</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p) => (
                <tr key={p.feature} className="border-b border-ink/15 last:border-0">
                  <td className="p-2.5 font-bold">{featureLabel(p.feature)}</td>
                  <td className="p-2.5 text-right tabular-nums">{p.nTakes}</td>
                  <td className="p-2.5 text-right tabular-nums">{Math.round(p.avgDivisiveness * 100)}</td>
                  <td className={`p-2.5 text-right font-bold tabular-nums ${p.lift > 0 ? "text-hot" : "text-not"}`}>
                    {p.lift > 0 ? "+" : ""}
                    {(p.lift * 100).toFixed(1)}
                  </td>
                </tr>
              ))}
              {patterns.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4">
                    No voted takes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Review({ take }: { take: RankedTake }) {
  return (
    <form action={reviewTake} className="pop bg-white p-4">
      <input type="hidden" name="id" value={take.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide" htmlFor={`s${take.id}`}>
            Statement shown to voters
          </label>
          <textarea id={`s${take.id}`} name="statement" defaultValue={take.statement} rows={3} maxLength={220} className="mt-1 w-full rounded-lg border-3 border-ink p-2 font-bold" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select name="topic" defaultValue={take.topic} aria-label="Topic" className="rounded-lg border-3 border-ink bg-white px-2 py-1.5 text-sm font-bold">
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {TOPIC_LABELS[t]}
                </option>
              ))}
            </select>
            <button name="status" value="approved" className={`${btn} bg-hot text-white`}>
              Approve
            </button>
            <button name="status" value="rejected" className={`${btn} bg-not text-white`}>
              Reject
            </button>
            <button name="status" value="" className={`${btn} bg-white`}>
              Save edit
            </button>
          </div>
        </div>
        <div className="text-sm">
          <p className="text-xs font-bold uppercase tracking-wide">
            Original post by{" "}
            <a href={take.source_url} target="_blank" rel="noopener noreferrer" className="underline">
              @{take.author_handle} ↗
            </a>
          </p>
          <blockquote className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap border-l-4 border-ink/30 pl-3">{take.original_text}</blockquote>
          <p className="mt-2 text-xs text-muted">
            Predicted divisiveness {Math.round(take.predicted * 100)}
            {take.llm_reason && ` · ${take.llm_reason}`}
            {take.llm_model && ` (${take.llm_model})`}
          </p>
        </div>
      </div>
    </form>
  );
}
