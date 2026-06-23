"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmtTime, fmtDateTime } from "@/lib/format";
import { useViewerZone } from "@/lib/useViewerZone";

// The final is 2026-07-19; after it, the cron stops and the payload is the frozen final state. Past
// this instant the freshness indicator reads "Final" rather than an ever-growing "Updated Xd ago",
// which would wrongly signal neglected/stale data.
const TOURNAMENT_OVER_MS = Date.parse("2026-07-20T00:00:00Z");

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/groups", label: "Groups" },
  { href: "/bracket", label: "Bracket" },
  { href: "/schedule", label: "Schedule" },
  { href: "/methodology", label: "Method" },
];

export function Nav({ updatedAt }: { updatedAt: string | null }) {
  const path = usePathname();

  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="mr-3 flex shrink-0 items-center gap-2 py-3">
          <span className="text-base">🏆</span>
          <span className="font-display hidden text-sm font-semibold tracking-tight sm:inline">World Cup 2026 Predictions</span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto [mask-image:linear-gradient(to_right,#000_86%,transparent)] sm:[mask-image:none]">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
                  active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-2 shrink-0">
          <Freshness updatedAt={updatedAt} />
        </div>
      </div>
    </header>
  );
}

// Global data-freshness indicator: a dot (green/amber/grey by age) + how long ago the dataset updated.
// `now` starts null so SSR and first client render match (both show the absolute ET time); a 30s ticker
// then switches to a live "Xm ago" relative time without a hydration mismatch.
function Freshness({ updatedAt }: { updatedAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  const { zone } = useViewerZone();
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!updatedAt) return null;
  if (now != null && now >= TOURNAMENT_OVER_MS) {
    return (
      <div
        className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs"
        title={`Final - predictions frozen at ${fmtDateTime(updatedAt, zone)}`}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
        <span className="whitespace-nowrap">Final</span>
      </div>
    );
  }
  const min = now == null ? null : Math.max(0, (now - new Date(updatedAt).getTime()) / 60000);
  const rel =
    min == null
      ? fmtTime(updatedAt, zone)
      : min < 1
        ? "just now"
        : min < 60
          ? `${Math.round(min)}m ago`
          : min < 1440
            ? `${Math.round(min / 60)}h ago`
            : `${Math.round(min / 1440)}d ago`;
  const dot = min == null || min < 45 ? "bg-emerald-400" : min < 180 ? "bg-amber-400" : "bg-muted-foreground";
  return (
    <div
      className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs"
      title={`Live data updated ${fmtDateTime(updatedAt, zone)}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="hidden whitespace-nowrap sm:inline">Updated {rel}</span>
      <span className="whitespace-nowrap sm:hidden">{rel}</span>
    </div>
  );
}
