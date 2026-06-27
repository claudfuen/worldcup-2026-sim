"use client";

import { useEffect, useState } from "react";

// Live "time until the World Cup final" chip. Time-relative, so it resolves only after mount (identical SSR
// and first client render — no hydration mismatch), then ticks each minute. Renders nothing once the final
// has kicked off / passed.
export function FinalCountdown({ utc, className = "" }: { utc: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return null;
  const diff = Date.parse(utc) - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const value = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return (
    <span className={`text-foreground/80 inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${className}`} suppressHydrationWarning>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="tabular-nums">{value}</span>
      <span className="text-muted-2 font-normal">to the final</span>
    </span>
  );
}
