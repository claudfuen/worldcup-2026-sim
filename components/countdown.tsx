"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/provider";

// Live countdown to a kickoff (a match, or the final). Time-relative, so it resolves only after mount
// (identical SSR + first client render — no hydration mismatch), then ticks every SECOND so the seconds
// keep moving and it feels alive. Renders nothing once the target time has passed.
export function Countdown({ utc, label = "", className = "" }: { utc: string; label?: string; className?: string }) {
  const t = useT();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return null;
  const diff = Date.parse(utc) - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={`text-foreground/80 inline-flex items-center gap-1.5 font-mono text-xs font-semibold ${className}`} suppressHydrationWarning>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-primary" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span className="tabular-nums">
        {days > 0 && <>{days}{t("match.unitDays")} </>}
        {(days > 0 || hours > 0) && <>{p(hours)}{t("match.unitHours")} </>}
        {p(mins)}{t("match.unitMins")} <span className="text-primary">{p(secs)}{t("match.unitSecs")}</span>
      </span>
      {label && <span className="text-muted-2 font-normal">{label}</span>}
    </span>
  );
}
