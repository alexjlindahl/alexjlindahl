import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ToolTag } from "@/components/Tag";
import { ADMIN_COOKIE, adminState } from "@/lib/admin";
import { computeInsights } from "@/lib/learn";
import { CUT_REASONS, getLearnedRules, recentCuts, recentSubmissions, topUnknown } from "@/lib/store";
import { jobLabel } from "@/lib/taxonomy";
import { TOOLS, getTool, toolName } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Insights | stack.here", robots: { index: false, follow: false } };

function Tags({ ids }: { ids: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const t = getTool(id);
        return t ? <ToolTag key={id} name={t.name} category={t.category} /> : <span key={id}>{id}</span>;
      })}
    </span>
  );
}

function Card({ title, children, note }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border-2 border-black p-5">
      <h2 className="text-xl font-black">{title}</h2>
      {note && <p className="mt-1 text-sm text-black/60">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Empty = () => <p className="text-sm text-black/50">No data yet.</p>;

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const state = adminState((await cookies()).get(ADMIN_COOKIE)?.value);
  const { error } = await searchParams;

  if (state === "disabled") {
    return (
      <div className="pt-12">
        <h1 className="text-5xl font-black tracking-tighter">Insights are off.</h1>
        <p className="mt-4 text-lg text-black/70">Set the ADMIN_PASSWORD environment variable to turn this page on.</p>
      </div>
    );
  }
  if (state === "login") {
    return (
      <form method="post" action="/api/insights-login" className="max-w-sm pt-12">
        <h1 className="text-5xl font-black tracking-tighter">Insights</h1>
        <label htmlFor="password" className="mt-6 block text-sm font-bold uppercase tracking-wide">
          Admin password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="mt-2 w-full rounded-xl border-2 border-black px-4 py-2.5 text-lg focus:outline-none focus:ring-4 focus:ring-black/15"
        />
        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-red-700">
            Wrong password.
          </p>
        )}
        <button type="submit" className="mt-4 rounded-xl bg-black px-6 py-2.5 font-black text-white hover:bg-black/80">
          Sign in
        </button>
      </form>
    );
  }

  const [subs, cuts, unknown, learned] = await Promise.all([
    recentSubmissions(),
    recentCuts(),
    topUnknown(),
    getLearnedRules(),
  ]);
  const ins = computeInsights(subs, cuts, TOOLS);
  const maxGrade = Math.max(1, ...Object.values(ins.grades));

  return (
    <div className="space-y-6 pt-6">
      <div>
        <h1 className="text-5xl font-black tracking-tighter">Insights</h1>
        {state === "open" && (
          <p className="mt-2 text-sm font-bold text-red-700">
            Open because ADMIN_PASSWORD is not set. In production this page is off until you set one.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Stacks graded", ins.totals.submissions.toLocaleString("en-US")],
          ["Average score", ins.totals.avgScore ?? "n/a"],
          ["Tools reported cut", ins.totals.cuts.toLocaleString("en-US")],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-black p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-wide text-white/60">{k}</p>
            <p className="mt-1 text-5xl font-black tracking-tighter">{v}</p>
          </div>
        ))}
      </div>

      <Card title="Grades">
        <div className="space-y-2">
          {Object.entries(ins.grades).map(([g, n]) => (
            <div key={g} className="flex items-center gap-3 text-sm">
              <span className="w-4 font-black">{g}</span>
              <div className="h-5 flex-1 rounded bg-black/[0.06]">
                <div className="h-5 rounded bg-black" style={{ width: `${(n / maxGrade) * 100}%` }} />
              </div>
              <span className="w-10 text-right tabular-nums">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Most common stacks" note="Exact same set of tools.">
          {ins.topStacks.length ? (
            <ol className="space-y-3">
              {ins.topStacks.map((s) => (
                <li key={s.tools.join("|")} className="flex items-start justify-between gap-3">
                  <Tags ids={s.tools} />
                  <span className="shrink-0 font-black tabular-nums">×{s.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Most common tools">
          {ins.topTools.length ? (
            <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {ins.topTools.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate font-medium">{toolName(t.id)}</span>
                  <span className="tabular-nums text-black/60">{t.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Most frequent overlaps" note="Direct overlaps: tools bought for the same main job.">
          {ins.topOverlaps.length ? (
            <ol className="space-y-3">
              {ins.topOverlaps.map((o) => (
                <li key={o.job + o.tools.join("|")} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-black/50">
                      {jobLabel(o.job)}
                    </span>
                    <Tags ids={o.tools} />
                  </span>
                  <span className="shrink-0 font-black tabular-nums">×{o.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Most-cut tools" note="From the “I cut a tool” button. Rate = cuts ÷ stacks containing the tool.">
          {ins.mostCut.length ? (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-black text-xs uppercase tracking-wide">
                  <th className="py-1.5">Tool</th>
                  <th className="py-1.5 text-right">Cuts</th>
                  <th className="py-1.5 text-right">Rate</th>
                  <th className="py-1.5 pl-4">Top reason</th>
                </tr>
              </thead>
              <tbody>
                {ins.mostCut.map((c) => {
                  const topReason = Object.entries(c.reasons).sort((a, b) => b[1] - a[1])[0]?.[0];
                  return (
                    <tr key={c.id} className="border-b border-black/10">
                      <td className="py-1.5 font-bold">{toolName(c.id)}</td>
                      <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {c.seen ? Math.round((c.count / c.seen) * 100) + "%" : "n/a"}
                      </td>
                      <td className="py-1.5 pl-4 text-black/70">{topReason ? CUT_REASONS[topReason] : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Overlaps by job">
          {ins.topOverlapJobs.length ? (
            <ol className="space-y-1.5 text-sm">
              {ins.topOverlapJobs.map((o) => (
                <li key={o.job} className="flex justify-between">
                  <span className="font-medium">{jobLabel(o.job)}</span>
                  <span className="tabular-nums text-black/60">{o.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Card>

        <Card
          title="Replacements"
          note="“Cut X, Y does the job now.” Pairs marked NEW share no job in the database: review them as candidate overlap rules."
        >
          {ins.replacements.length ? (
            <ol className="space-y-1.5 text-sm">
              {ins.replacements.map((r) => (
                <li key={r.from + r.to} className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {toolName(r.from)} → {toolName(r.to)}
                    {!r.sharesJob && (
                      <span className="ml-2 rounded bg-yellow-300 px-1.5 py-0.5 text-xs font-black">NEW</span>
                    )}
                  </span>
                  <span className="tabular-nums text-black/60">{r.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Names we didn't recognize" note="Candidates for the tool database. Stored as counts only.">
          {unknown.length ? (
            <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {unknown.map((u) => (
                <li key={u.name} className="flex justify-between gap-2">
                  <span className="truncate font-medium">{u.name}</span>
                  <span className="tabular-nums text-black/60">{u.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Card>

        <Card title="Learned rules" note="Refreshed weekly by cron, or with `npm run refresh`.">
          {learned ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-bold">{learned.version}</span>, from {learned.sampleSize.submissions} stacks and{" "}
                {learned.sampleSize.cuts} cuts.
              </p>
              <div>
                <p className="font-bold">Overlap weight changes</p>
                {Object.keys(learned.jobWeight).length ? (
                  <ul>
                    {Object.entries(learned.jobWeight).map(([j, m]) => (
                      <li key={j}>
                        {jobLabel(j)}: ×{m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-black/50">None yet (needs more cut reports).</p>
                )}
              </div>
              <div>
                <p className="font-bold">Tools with a cut-rate penalty</p>
                {Object.keys(learned.toolCutPenalty).length ? (
                  <ul>
                    {Object.entries(learned.toolCutPenalty).map(([id, p]) => (
                      <li key={id}>
                        {toolName(id)}: −{p} points
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-black/50">None yet.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-black/50">Not run yet. Grades are using the base rules.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
