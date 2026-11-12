"use client";

import { useState } from "react";

interface Opt {
  id: string;
  name: string;
}

export function CutForm({
  submissionId,
  stackTools,
  allTools,
  reasons,
}: {
  submissionId: string;
  stackTools: Opt[];
  allTools: Opt[];
  reasons: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [toolId, setToolId] = useState("");
  const [reason, setReason] = useState("");
  const [replacedBy, setReplacedBy] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  if (state === "done") {
    return (
      <div className="mt-5">
        <p className="font-bold">Thanks. Logged.</p>
        <button
          type="button"
          className="mt-2 text-sm font-medium underline underline-offset-4"
          onClick={() => {
            setToolId("");
            setReason("");
            setReplacedBy("");
            setNote("");
            setState("idle");
          }}
        >
          Report another
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-5 rounded-xl border-2 border-black bg-white px-5 py-2.5 font-black hover:bg-black hover:text-white"
      >
        I cut a tool
      </button>
    );
  }

  const stackIds = new Set(stackTools.map((t) => t.id));
  const field = "w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 font-medium focus:outline-none focus:ring-4 focus:ring-black/15";

  return (
    <form
      className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        const res = await fetch("/api/cut", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ submissionId, toolId, reason, replacedBy: replacedBy || null, note }),
        }).catch(() => null);
        setState(res?.ok ? "done" : "error");
      }}
    >
      <label className="block text-sm font-bold">
        What did you cut?
        <select required value={toolId} onChange={(e) => setToolId(e.target.value)} className={field + " mt-1.5"}>
          <option value="">Choose a tool</option>
          {stackTools.length > 0 && (
            <optgroup label="In this stack">
              {stackTools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="All tools">
            {allTools
              .filter((t) => !stackIds.has(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </optgroup>
        </select>
      </label>
      <label className="block text-sm font-bold">
        Why?
        <select required value={reason} onChange={(e) => setReason(e.target.value)} className={field + " mt-1.5"}>
          <option value="">Choose a reason</option>
          {Object.entries(reasons).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {(reason === "replaced" || reason === "overlap") && (
        <label className="block text-sm font-bold">
          Which tool does the job now? <span className="font-medium text-black/50">(optional)</span>
          <select value={replacedBy} onChange={(e) => setReplacedBy(e.target.value)} className={field + " mt-1.5"}>
            <option value="">Not sure</option>
            {allTools
              .filter((t) => t.id !== toolId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="block text-sm font-bold sm:col-span-2">
        Anything else? <span className="font-medium text-black/50">(optional, no names or emails please)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          className={field + " mt-1.5"}
          placeholder="e.g. only two reps ever logged in"
        />
      </label>
      <div className="flex items-center gap-4 sm:col-span-2">
        <button
          type="submit"
          disabled={state === "busy"}
          className="rounded-xl bg-black px-5 py-2.5 font-black text-white hover:bg-black/80 disabled:bg-black/30"
        >
          {state === "busy" ? "Sending..." : "Send"}
        </button>
        {state === "error" && (
          <span role="alert" className="text-sm font-bold text-red-700">
            That didn't save. Try again.
          </span>
        )}
      </div>
    </form>
  );
}
