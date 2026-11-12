"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Choice, type Counts, split, TOPIC_LABELS } from "@/lib/scoring";
import { SplitBar } from "./SplitBar";

export interface DeckTake {
  id: number;
  statement: string;
  topic: string;
  reveal: { handle: string; url: string };
  result: { choice: Choice; counts: Counts; handle: string; url: string } | null;
}

const SWIPE_AT = 90;
const LABEL: Record<Choice, string> = { hot: "Hot", not: "Not", depends: "It depends" };

function statementSize(s: string) {
  if (s.length < 50) return "text-4xl sm:text-5xl";
  if (s.length < 90) return "text-3xl sm:text-4xl";
  return "text-2xl sm:text-3xl";
}

export function VoteDeck({ takes: initial, day, dayLabel }: { takes: DeckTake[]; day: string; dayLabel: string }) {
  const [takes, setTakes] = useState(initial);
  const firstOpen = initial.findIndex((t) => !t.result);
  const [index, setIndex] = useState(firstOpen === -1 ? initial.length : firstOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const take = takes[index];
  const done = index >= takes.length;
  const answered = takes.filter((t) => t.result).length;

  const vote = useCallback(
    async (choice: Choice) => {
      if (!take || take.result || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ takeId: take.id, choice }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not record your vote");
        setTakes((ts) => ts.map((t) => (t.id === take.id ? { ...t, result: { choice: body.choice, counts: body.counts, ...t.reveal } } : t)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not record your vote");
      } finally {
        setBusy(false);
        setDrag(0);
      }
    },
    [take, busy],
  );

  const next = useCallback(() => {
    setError(null);
    setIndex((i) => {
      const later = takes.findIndex((t, j) => j > i && !t.result);
      return later === -1 ? takes.length : later;
    });
  }, [takes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !take) return;
      if (take.result) {
        if (e.key === "ArrowRight") next();
      } else if (e.key === "ArrowRight") vote("hot");
      else if (e.key === "ArrowLeft") vote("not");
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        vote("depends");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [take, vote, next]);

  if (done) return <Done takes={takes} day={day} />;

  const voted = take.result;
  const lean = drag > 30 ? "hot" : drag < -30 ? "not" : null;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{dayLabel}</p>
          <h1 className="font-display text-2xl leading-none sm:text-3xl">
            <span className="text-hot">Hot</span> or <span className="text-not">Not</span>?
          </h1>
        </div>
        <p className="font-display text-lg tabular-nums" aria-label={`Take ${index + 1} of ${takes.length}`}>
          {index + 1}
          <span className="text-muted">/{takes.length}</span>
        </p>
      </div>

      <ol className="mb-4 flex gap-1.5" aria-hidden>
        {takes.map((t, i) => (
          <li
            key={t.id}
            className={`h-2.5 flex-1 rounded-full border-2 border-ink ${
              t.result ? (t.result.choice === "hot" ? "bg-hot" : t.result.choice === "not" ? "bg-not" : "bg-depends") : i === index ? "bg-ink" : "bg-white"
            }`}
          />
        ))}
      </ol>

      <div className="relative">
        {/* the next card peeking out underneath */}
        <div className="pop absolute inset-0 translate-x-2 translate-y-2 rotate-2 bg-white" aria-hidden />
        <article
          key={take.id}
          className={`pop animate-rise relative flex min-h-[21rem] touch-pan-y select-none flex-col p-5 sm:min-h-[23rem] sm:p-7 ${
            voted ? "bg-white" : lean === "hot" ? "bg-hot-soft" : lean === "not" ? "bg-not-soft" : "bg-white"
          } ${voted ? "" : "cursor-grab active:cursor-grabbing"}`}
          style={voted ? undefined : { transform: `translateX(${drag}px) rotate(${drag / 22}deg)`, transition: dragging ? "none" : "transform 0.2s ease" }}
          onPointerDown={(e) => {
            if (voted || busy || (e.target as HTMLElement).closest("a,button")) return;
            start.current = e.clientX;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current != null) setDrag(e.clientX - start.current);
          }}
          onPointerUp={() => {
            if (start.current == null) return;
            start.current = null;
            setDragging(false);
            if (drag > SWIPE_AT) vote("hot");
            else if (drag < -SWIPE_AT) vote("not");
            else setDrag(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDrag(0);
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">{TOPIC_LABELS[take.topic] ?? take.topic}</span>
            {lean && !voted && <span className={`font-display text-2xl uppercase ${lean === "hot" ? "text-hot" : "text-not"}`}>{lean}!</span>}
          </div>

          <h2 className={`font-display ${statementSize(take.statement)} leading-[1.08] text-balance`}>{take.statement}</h2>

          {voted && (
            <div className="animate-rise mt-auto pt-6">
              <p className="mb-2 text-sm font-bold">
                You said{" "}
                <span className={`rounded-md px-1.5 py-0.5 ${voted.choice === "hot" ? "bg-hot text-white" : voted.choice === "not" ? "bg-not text-white" : "bg-depends"}`}>{LABEL[voted.choice]}</span>
                <Verdict choice={voted.choice} counts={voted.counts} />
              </p>
              <SplitBar counts={voted.counts} size="lg" animate />
              <p className="mt-4 text-sm">
                <a href={voted.url} target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-2 underline-offset-2 hover:text-hot">
                  Original post by @{voted.handle} on X ↗
                </a>
                <span className="mx-2 text-muted">·</span>
                <Link href={`/take/${take.id}`} className="font-bold underline decoration-2 underline-offset-2 hover:text-not">
                  Share card
                </Link>
              </p>
            </div>
          )}
        </article>
      </div>

      <p role="alert" className={`mt-4 min-h-5 text-center text-sm font-bold text-hot ${error ? "" : "invisible"}`}>
        {error}
      </p>

      {voted ? (
        <button onClick={next} className="pop press mt-1 w-full bg-ink py-4 font-display text-xl text-paper">
          {takes.some((t, j) => j > index && !t.result) ? "Next take →" : "See today's results →"}
        </button>
      ) : (
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
          <button disabled={busy} onClick={() => vote("not")} className="pop press bg-not py-4 font-display text-2xl text-white disabled:opacity-60">
            ← Not
          </button>
          <button disabled={busy} onClick={() => vote("depends")} className="pop press bg-depends px-3 text-sm font-bold leading-tight disabled:opacity-60">
            It
            <br />
            depends
          </button>
          <button disabled={busy} onClick={() => vote("hot")} className="pop press bg-hot py-4 font-display text-2xl text-white disabled:opacity-60">
            Hot →
          </button>
        </div>
      )}
      <p className="mt-4 text-center text-xs text-muted">
        {voted ? `${answered} of ${takes.length} answered` : "Swipe right for Hot (agree), left for Not (disagree). Arrow keys work too."}
      </p>
    </div>
  );
}

function Verdict({ choice, counts }: { choice: Choice; counts: Counts }) {
  const s = split(counts);
  if (choice === "depends" || s.decided < 3) return null;
  const mine = choice === "hot" ? s.hotPct : s.notPct;
  return <span className="ml-2 font-normal text-muted">{mine >= 50 ? `with ${mine}% of voters` : `with the ${mine}% minority`}</span>;
}

function Done({ takes, day }: { takes: DeckTake[]; day: string }) {
  const count = (c: Choice) => takes.filter((t) => t.result?.choice === c).length;
  const contrarian = takes.filter((t) => {
    if (!t.result || t.result.choice === "depends") return false;
    const s = split(t.result.counts);
    return s.decided >= 3 && (t.result.choice === "hot" ? s.hotPct : s.notPct) < 50;
  }).length;
  return (
    <div className="mx-auto max-w-xl">
      <div className="pop animate-rise bg-depends p-6 text-center sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest">That&apos;s all ten</p>
        <h1 className="mt-1 font-display text-4xl leading-none sm:text-5xl">Done for today.</h1>
        <div className="mt-6 grid grid-cols-3 gap-3 text-left">
          {(["hot", "not", "depends"] as const).map((c) => (
            <div key={c} className={`pop-sm p-3 ${c === "hot" ? "bg-hot text-white" : c === "not" ? "bg-not text-white" : "bg-white"}`}>
              <div className="font-display text-3xl leading-none">{count(c)}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wide">{LABEL[c]}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 font-bold">
          {contrarian === 0 ? "You sided with the majority every time." : `You went against the majority on ${contrarian} ${contrarian === 1 ? "take" : "takes"}.`}
        </p>
        <Link href={`/results/${day}`} className="pop press mt-6 inline-block bg-ink px-6 py-3.5 font-display text-lg text-paper">
          See how everyone split →
        </Link>
        <p className="mt-5 text-sm">Ten new takes tomorrow.</p>
      </div>
    </div>
  );
}
