"use client";

import Link from "next/link";

// Catches a failed render (e.g. ESPN/KV briefly unavailable) instead of crashing to a blank screen.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70svh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="bg-card border-border w-full rounded-2xl border p-8">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mx-auto" aria-hidden>
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" />
        </svg>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Live data is briefly unavailable</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The forecast is refreshed from live results and occasionally hiccups. Give it a moment and try again.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Try again
          </button>
          <Link
            href="/"
            className="border-border text-muted-foreground hover:text-foreground rounded-full border px-4 py-2 text-sm"
          >
            Overview
          </Link>
        </div>
      </div>
    </main>
  );
}
