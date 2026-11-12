"use client";

import { useState } from "react";

export function ShareBar({ url, cardUrl, grade }: { url: string; cardUrl: string; grade: string }) {
  const [copied, setCopied] = useState(false);
  const text = `My GTM stack got a ${grade} on stack.here`;
  const btn = "rounded-xl border-2 border-black px-4 py-2 text-sm font-bold hover:bg-black hover:text-white";
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={btn + " bg-black text-white hover:bg-black/80"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copy this link", url);
          }
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      <a className={btn} href={cardUrl} download={`stack-here-${grade}.png`}>
        Download card
      </a>
      <a
        className={btn}
        target="_blank"
        rel="noreferrer"
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
      >
        Share on LinkedIn
      </a>
      <a
        className={btn}
        target="_blank"
        rel="noreferrer"
        href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
      >
        Share on X
      </a>
      <span className="break-all text-sm text-black/50">{url}</span>
    </div>
  );
}
