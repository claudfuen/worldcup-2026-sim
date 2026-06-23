"use client";

import { useState } from "react";

// Pure-link share controls (no SDKs, no CSP issues). Prefilled text carries the hook; the page's
// dynamic OG image auto-attaches when the link unfurls.
export function ShareBar({ text, path }: { text: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url = `https://worldcup2026predictions.app${path}`;
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the X/WhatsApp links still work */
    }
  };

  const pill = "border-border bg-card hover:border-primary/50 hover:bg-surface-raised inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-2 text-[11px] font-medium tracking-wide uppercase">Share</span>
      <a href={x} target="_blank" rel="noopener noreferrer" className={pill} aria-label="Share on X">
        <span className="font-semibold">X</span>
      </a>
      <a href={wa} target="_blank" rel="noopener noreferrer" className={pill} aria-label="Share on WhatsApp">
        WhatsApp
      </a>
      <button type="button" onClick={copy} className={pill} aria-label="Copy link">
        {copied ? <span className="text-win">✓ Copied</span> : "Copy link"}
      </button>
    </div>
  );
}
