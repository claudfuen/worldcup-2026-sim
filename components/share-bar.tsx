"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";

// Pure-link share controls (no SDKs, no CSP issues). Prefilled text carries the hook; the page's
// dynamic OG image auto-attaches when the link unfurls.
export function ShareBar({ text, path }: { text: string; path: string }) {
  const t = useT();
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

  const btn = "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground inline-flex size-10 items-center justify-center rounded-md border sm:size-8";

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-2 mr-1 text-[10px] font-semibold tracking-wide uppercase">{t("share.label")}</span>
      <a href={x} target="_blank" rel="noopener noreferrer" data-evt="share" data-channel="x" data-path={path} className={btn} aria-label={t("share.shareOnX")} title={t("share.shareOnX")}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" /></svg>
      </a>
      <a href={wa} target="_blank" rel="noopener noreferrer" data-evt="share" data-channel="whatsapp" data-path={path} className={btn} aria-label={t("share.shareOnWhatsApp")} title={t("share.shareOnWhatsApp")}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.2 4.79 1.2 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15c-1.52 0-3.01-.41-4.3-1.18l-.31-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23 4.54 0 8.23 3.69 8.23 8.23 0 4.54-3.69 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.48-1.38-1.73-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" /></svg>
      </a>
      <button type="button" onClick={copy} data-evt="share" data-channel="copy" data-path={path} className={`${btn} ${copied ? "text-win border-win/40" : ""}`} aria-label={t("share.copyLink")} title={copied ? t("share.copied") : t("share.copyLink")}>
        {copied ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 13a5 5 0 0 0 7.07 0l1.5-1.5a5 5 0 0 0-7.07-7.07L11 5" /><path d="M14 11a5 5 0 0 0-7.07 0l-1.5 1.5a5 5 0 0 0 7.07 7.07L13 19" /></svg>
        )}
      </button>
    </div>
  );
}
