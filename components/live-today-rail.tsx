"use client";

import Link from "next/link";
import { Flag } from "@/components/flag";
import { useViewerZone } from "@/lib/useViewerZone";
import { fmtTime, fmtDayKey, pct } from "@/lib/format";
import { HotBadge } from "@/components/hot-badge";
import type { MatchInfo } from "@/lib/predictions";

// J1 — "what's happening right now", promoted to the top of the homepage. A LIVE NOW lane (scores + clock,
// with the model's PRE-MATCH favorite shown for context — never a fake live %), then a compact today/
// last-night slate. Curated and capped, never the full schedule. Client-side so the day boundary follows
// the viewer's timezone (no near-midnight hydration mismatch).
export function LiveTodayRail({ matches, hotReasons = {}, className = "" }: { matches: MatchInfo[]; hotReasons?: Record<number, string>; className?: string }) {
  const { zone, ready } = useViewerZone();
  if (!ready) return null;
  const nowIso = new Date().toISOString();
  const today = fmtDayKey(nowIso, zone);
  const yest = fmtDayKey(new Date(Date.parse(nowIso) - 86400000).toISOString(), zone);

  const live = matches.filter((m) => m.status === "live").sort((a, b) => a.utc.localeCompare(b.utc));
  // Today leads (chronological — morning results then the evening slate), then last night's finals fill any
  // remaining room. Sorting the whole set by time would bury today's upcoming behind yesterday's scores.
  const todayMatches = matches
    .filter((m) => m.status !== "live" && fmtDayKey(m.utc, zone) === today)
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const lastNight = matches
    .filter((m) => m.status === "final" && fmtDayKey(m.utc, zone) === yest)
    .sort((a, b) => b.utc.localeCompare(a.utc));
  const slate = [...todayMatches, ...lastNight];

  // Nothing live and nothing today: collapse to a single "up next" line.
  if (live.length === 0 && slate.length === 0) {
    const next = matches.filter((m) => m.status === "scheduled").sort((a, b) => a.utc.localeCompare(b.utc))[0];
    if (!next) return null;
    return (
      <section className={className} suppressHydrationWarning>
        <h2 className="text-muted-foreground mb-2 font-mono text-xs font-semibold tracking-wide uppercase">Up next</h2>
        <div className="border-border bg-card overflow-hidden rounded-2xl border">
          <SlateRow m={next} zone={zone} today={today} hotReason={hotReasons[next.match]} />
        </div>
      </section>
    );
  }

  // Room for the full day plus several last-night results — also lets the rail balance the homepage's
  // right-hand snapshot column (stage/bracket/groups/title) so the dashboard's two columns end together.
  const CAP = 10;
  const shownSlate = slate.slice(0, CAP);
  const hasLastNight = shownSlate.some((m) => m.status === "final" && fmtDayKey(m.utc, zone) === yest);
  const slateLabel = live.length > 0 ? "Also today" : hasLastNight ? "Today & last night" : "Today";

  return (
    <section className={className} suppressHydrationWarning>
      {live.length > 0 && (
        <div className="mb-5">
          <h2 className="text-live mb-2 flex items-center gap-2 font-mono text-xs font-semibold tracking-wide uppercase">
            <span className="bg-live size-1.5 animate-pulse rounded-full" />Live now
          </h2>
          <div className="border-live/30 bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
            {live.slice(0, 3).map((m) => <LiveRow key={m.match} m={m} />)}
          </div>
          {live.length > 3 && (
            <Link href="/schedule" className="text-primary mt-2 inline-block text-xs hover:underline">and {live.length - 3} more live →</Link>
          )}
        </div>
      )}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">{slateLabel}</h2>
        <Link href="/schedule" className="text-primary text-xs hover:underline">Full schedule →</Link>
      </div>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
        {shownSlate.map((m) => <SlateRow key={m.match} m={m} zone={zone} today={today} hotReason={hotReasons[m.match]} />)}
      </div>
      {slate.length > CAP && (
        <Link href="/schedule" className="text-primary mt-2 inline-block text-xs hover:underline">+{slate.length - CAP} more →</Link>
      )}
    </section>
  );
}

function LiveRow({ m }: { m: MatchInfo }) {
  return (
    <Link href={`/match/${m.match}`} className="hover:bg-muted/20 block px-4 py-3">
      <div className="flex items-center gap-2">
        <Flag code={m.home} size={18} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.homeName}</span>
        <span className="shrink-0 px-1 font-mono text-sm font-bold tabular-nums">{m.homeScore}–{m.awayScore}</span>
        <Flag code={m.away} size={18} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.awayName}</span>
        <span className="text-live ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-semibold">
          <span className="bg-live size-1.5 animate-pulse rounded-full" />{m.liveDetail ?? "LIVE"}
        </span>
      </div>
      {m.favorite && <div className="text-muted-2 mt-1 text-[11px]">pre-match: {m.favorite.name} {pct(m.favorite.winProb)}</div>}
    </Link>
  );
}

function SlateRow({ m, zone, today, hotReason }: { m: MatchInfo; zone?: import("@/lib/format").Zone; today: string; hotReason?: string }) {
  const final = m.status === "final";
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeName = m.homeName ?? m.projHome?.[0]?.name ?? m.slotHome ?? "TBD";
  const awayName = m.awayName ?? m.projAway?.[0]?.name ?? m.slotAway ?? "TBD";
  const isYesterday = final && fmtDayKey(m.utc, zone) !== today;
  return (
    <Link href={`/match/${m.match}`} className="hover:bg-muted/20 flex items-center gap-3 px-4 py-2.5">
      <span className="text-muted-2 w-16 shrink-0 font-mono text-[11px]" suppressHydrationWarning>
        {isYesterday ? "Last night" : fmtTime(m.utc, zone)}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Flag code={homeCode} size={16} />
        <span className="truncate">{homeName}</span>
        <span className="text-muted-2 shrink-0 text-xs">v</span>
        <Flag code={awayCode} size={16} />
        <span className="truncate">{awayName}</span>
      </div>
      {hotReason != null && <HotBadge reason={hotReason} className="shrink-0" />}
      <span className="shrink-0 text-right text-[11px]">
        {final ? (
          <span className="font-mono"><span className="text-foreground font-medium tabular-nums">{m.homeScore}–{m.awayScore}</span> <span className="text-win">FT</span></span>
        ) : m.favorite ? (
          <span className="text-muted-2"><span className="text-foreground/80">{m.favorite.name}</span> {pct(m.favorite.winProb)}</span>
        ) : (
          <span className="text-muted-2">projected</span>
        )}
      </span>
    </Link>
  );
}
