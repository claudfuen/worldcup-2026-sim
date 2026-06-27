import Link from "next/link";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import type { MatchInfo } from "@/lib/predictions";

// A persistent, auto-scrolling pulse strip under the nav — present on every page. Three states, colour-
// coded for a clear at-a-glance distinction: LIVE (red, pulsing dot + clock) → UPCOMING (cool blue, local
// kickoff time) → FINISHED (green FT + score). Pure CSS marquee (two copies, translate -50%), pauses on
// hover, every item links to its match. Server-rendered; no live win-prob, just real scores and times.
export function ScoreTicker({ items }: { items: MatchInfo[] }) {
  if (items.length === 0) return null;
  const dur = Math.max(40, items.length * 6); // scale duration with count → consistent scroll speed
  return (
    <div className="border-border/60 bg-background/70 sticky top-14 z-40 overflow-hidden border-b backdrop-blur-xl">
      <div
        className="flex w-max [animation:ticker_var(--d)_linear_infinite] hover:[animation-play-state:paused]"
        style={{ "--d": `${dur}s` } as React.CSSProperties}
      >
        <Track items={items} />
        <Track items={items} ariaHidden />
      </div>
    </div>
  );
}

function Track({ items, ariaHidden }: { items: MatchInfo[]; ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0" aria-hidden={ariaHidden}>
      {items.map((m, i) => <TickerItem key={`${m.match}-${i}`} m={m} />)}
    </div>
  );
}

function TickerItem({ m }: { m: MatchInfo }) {
  const live = m.status === "live";
  const final = m.status === "final";
  const homeWon = m.winner != null && m.winner === m.home;
  const awayWon = m.winner != null && m.winner === m.away;
  const nameCls = (won: boolean) => (final ? (won ? "text-foreground" : "text-muted-foreground") : "text-foreground/90");
  return (
    <Link
      href={`/match/${m.match}`}
      className="hover:bg-muted/30 border-border/40 flex shrink-0 items-center gap-1.5 border-r px-4 py-1.5 text-xs whitespace-nowrap"
    >
      {live && <span className="bg-live size-1.5 shrink-0 animate-pulse rounded-full" aria-hidden />}
      <Flag code={m.home} size={13} />
      <span className={`font-medium ${nameCls(homeWon)}`}>{m.home}</span>
      {live || final ? (
        <span className="text-foreground font-mono font-semibold tabular-nums">{m.homeScore}<span className="text-muted-2">–</span>{m.awayScore}</span>
      ) : (
        <span className="text-muted-2 px-0.5">v</span>
      )}
      <span className={`font-medium ${nameCls(awayWon)}`}>{m.away}</span>
      <Flag code={m.away} size={13} />
      <span className={`ml-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${live ? "text-live" : final ? "text-win" : "text-data-cool"}`}>
        {live ? (m.liveDetail ?? "Live") : final ? "FT" : <LocalTime utc={m.utc} mode="timeshort" />}
      </span>
    </Link>
  );
}
