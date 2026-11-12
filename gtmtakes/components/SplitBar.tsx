import { type Counts, split } from "@/lib/scoring";

/** The red/blue bar. Hot fills from the left, Not from the right. */
export function SplitBar({ counts, size = "md", animate = false }: { counts: Counts; size?: "md" | "lg"; animate?: boolean }) {
  const s = split(counts);
  const h = size === "lg" ? "h-14 text-2xl" : "h-10 text-lg";
  if (s.decided === 0) {
    return <div className={`pop-sm flex ${h} items-center justify-center bg-white text-sm font-bold text-muted`}>No Hot or Not votes yet</div>;
  }
  return (
    <div>
      <div className={`pop-sm flex ${h} overflow-hidden bg-not font-display text-white ${animate ? "animate-grow" : ""}`} role="img" aria-label={`${s.hotPct}% Hot, ${s.notPct}% Not`}>
        <div className="flex items-center bg-hot pl-3" style={{ width: `${s.hotPct}%`, minWidth: s.hotPct > 0 ? "3.2rem" : 0, borderRight: s.hotPct > 0 && s.notPct > 0 ? "3px solid var(--color-ink)" : undefined }}>
          {s.hotPct > 0 && `${s.hotPct}%`}
        </div>
        <div className="flex flex-1 items-center justify-end pr-3">{s.notPct > 0 && `${s.notPct}%`}</div>
      </div>
      <div className="mt-1.5 flex justify-between text-xs font-bold uppercase tracking-wide">
        <span className="text-hot">Hot</span>
        <span className="text-muted normal-case tracking-normal">
          {s.total.toLocaleString("en-US")} {s.total === 1 ? "vote" : "votes"}
          {counts.depends > 0 && ` · ${s.dependsPct}% said it depends`}
        </span>
        <span className="text-not">Not</span>
      </div>
    </div>
  );
}
