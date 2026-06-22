"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// When a match is in progress, re-fetch the page on an interval so live scores update on their own
// (the server components re-pull fresh live data each refresh). Renders nothing; only runs when enabled.
export function LiveAutoRefresh({ enabled, intervalMs = 30_000 }: { enabled: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);
  return null;
}
