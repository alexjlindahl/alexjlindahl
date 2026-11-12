"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createMatcher } from "@/lib/parse";
import { ToolTag } from "./Tag";

interface IndexTool {
  id: string;
  name: string;
  aliases: string[];
  category: string;
}

export function StackForm({
  index,
  samples,
  toolCount,
}: {
  index: IndexTool[];
  samples: { label: string; text: string; teamSize: number }[];
  toolCount: number;
}) {
  const router = useRouter();
  const matcher = useMemo(() => createMatcher(index), [index]);
  const byId = useMemo(() => new Map(index.map((t) => [t.id, t])), [index]);
  const [text, setText] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [seats, setSeats] = useState<Record<string, string>>({});
  const [showSeats, setShowSeats] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => matcher.parse(text), [matcher, text]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.matched.length) {
      setError("We didn't recognize any tools in that. Try names separated by commas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const seatMap: Record<string, number> = {};
      for (const [id, v] of Object.entries(seats)) {
        const n = parseInt(v, 10);
        if (n > 0) seatMap[id] = n;
      }
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, teamSize: parseInt(teamSize, 10) || null, seats: seatMap }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.push(`/s/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="stack" className="mb-2 block text-sm font-bold uppercase tracking-wide">
          Your tools
        </label>
        <textarea
          id="stack"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Clay, HubSpot, Apollo, Outreach, Gong..."
          className="w-full rounded-2xl border-2 border-black p-4 text-xl font-medium placeholder:text-black/30 focus:outline-none focus:ring-4 focus:ring-black/15"
        />
        <p className="mt-2 text-sm text-black/60">
          Commas or new lines. Typos are fine. Matches against {toolCount} tools.
        </p>
      </div>

      {(parsed.matched.length > 0 || parsed.unknown.length > 0) && (
        <div className="flex flex-wrap gap-2" aria-live="polite">
          {parsed.matched.map((m) => {
            const t = byId.get(m.toolId)!;
            return <ToolTag key={m.toolId} name={t.name} category={t.category} />;
          })}
          {parsed.unknown.map((u) => (
            <span
              key={u}
              title="Not in the database yet. It won't affect the grade."
              className="inline-flex items-center rounded-full border border-dashed border-black/40 px-3 py-1 text-sm text-black/60"
            >
              {u} ?
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="team" className="mb-2 block text-sm font-bold uppercase tracking-wide">
            Team size <span className="font-medium normal-case text-black/50">(optional)</span>
          </label>
          <input
            id="team"
            type="number"
            min={1}
            max={100000}
            inputMode="numeric"
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            placeholder="e.g. 12"
            className="w-36 rounded-xl border-2 border-black px-4 py-2.5 text-lg font-medium placeholder:text-black/30 focus:outline-none focus:ring-4 focus:ring-black/15"
          />
        </div>
        {parsed.matched.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSeats((s) => !s)}
            className="pb-3 text-sm font-medium underline underline-offset-4"
          >
            {showSeats ? "Hide seats per tool" : "Set seats per tool (optional)"}
          </button>
        )}
      </div>

      {showSeats && parsed.matched.length > 0 && (
        <div className="grid gap-3 rounded-2xl border border-black/15 p-4 sm:grid-cols-2 md:grid-cols-3">
          {parsed.matched.map((m) => {
            const t = byId.get(m.toolId)!;
            return (
              <label key={m.toolId} className="flex items-center justify-between gap-3 text-sm font-medium">
                <span className="truncate">{t.name}</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label={`Seats for ${t.name}`}
                  value={seats[m.toolId] ?? (m.seats ? String(m.seats) : "")}
                  onChange={(e) => setSeats((s) => ({ ...s, [m.toolId]: e.target.value }))}
                  placeholder={teamSize || "seats"}
                  className="w-24 rounded-lg border border-black/40 px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-black/30"
                />
              </label>
            );
          })}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="rounded-2xl bg-black px-8 py-4 text-xl font-black text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/30"
      >
        {busy ? "Grading..." : "Grade my stack"}
      </button>

      <div className="pt-6">
        <p className="mb-3 text-sm font-bold uppercase tracking-wide">Or try a sample</p>
        <div className="flex flex-wrap gap-2">
          {samples.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setText(s.text);
                setTeamSize(String(s.teamSize));
                setSeats({});
                setError(null);
              }}
              className="rounded-full border border-black px-3.5 py-1.5 text-sm font-medium hover:bg-black hover:text-white"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
