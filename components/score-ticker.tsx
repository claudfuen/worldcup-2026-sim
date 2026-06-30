"use client";
import Link from "next/link";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import type { MatchInfo } from "@/lib/predictions";
import { decidedOnPens, pensScore } from "@/lib/penalties";
import { useViewerZone } from "@/lib/useViewerZone";
import { relativeDay } from "@/lib/format";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { useLivePoll } from "@/lib/useLivePoll";

type TickerData = { items: MatchInfo[]; hasLive: boolean };

// A persistent, auto-scrolling pulse strip under the nav — present on every page. Three states, colour-
// coded for a clear at-a-glance distinction: LIVE (red, pulsing dot + clock) → UPCOMING (cool blue, local
// kickoff time) → FINISHED (green FT + score). Pure CSS marquee (two copies, translate -50%), pauses on
// hover, every item links to its match. SSR paints `initialItems`; then it polls /api/ticker (fast while a
// match is live, slow otherwise) so scores tick on their own without a full page re-render — no live win-prob.
export function ScoreTicker({ initialItems, hasLive }: { initialItems: MatchInfo[]; hasLive: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { zone } = useViewerZone();
  const nowIso = new Date().toISOString();
  const { items } = useLivePoll<TickerData>(
    "/api/ticker",
    { items: initialItems, hasLive },
    (d) => d?.items.some((m) => m.status === "live") ?? false,
  );
  if (items.length === 0) return null;
  const dur = Math.max(40, items.length * 6); // scale duration with count → consistent scroll speed
  return (
    <div className="border-border/60 bg-background/70 sticky top-14 z-40 overflow-hidden border-b backdrop-blur-xl">
      <div
        className="ticker-track flex w-max [animation:ticker_var(--d)_linear_infinite] hover:[animation-play-state:paused]"
        style={{ "--d": `${dur}s` } as React.CSSProperties}
      >
        <Track items={items} t={t} locale={locale} nowIso={nowIso} zone={zone} />
        <Track items={items} t={t} locale={locale} nowIso={nowIso} zone={zone} ariaHidden />
      </div>
    </div>
  );
}

function Track({ items, t, locale, nowIso, zone, ariaHidden }: { items: MatchInfo[]; t: TFunction; locale: Locale; nowIso: string; zone: import("@/lib/format").Zone; ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0" aria-hidden={ariaHidden}>
      {items.map((m, i) => <TickerItem key={`${m.match}-${i}`} m={m} t={t} locale={locale} nowIso={nowIso} zone={zone} />)}
    </div>
  );
}

function TickerItem({ m, t, locale, nowIso, zone }: { m: MatchInfo; t: TFunction; locale: Locale; nowIso: string; zone: import("@/lib/format").Zone }) {
  const live = m.status === "live";
  const final = m.status === "final";
  // Upcoming kickoff → a friendly relative day ("Tonight" / "Tomorrow" / weekday / date), or nothing for a
  // daytime match today (the bare time already reads as today).
  const rel = !live && !final ? relativeDay(m.utc, zone, nowIso) : null;
  const dayWord = rel ? (rel.key ? t(`time.${rel.key}`) : rel.text) : null;
  const homeWon = m.winner != null && m.winner === m.home;
  const awayWon = m.winner != null && m.winner === m.away;
  const nameCls = (won: boolean) => (final ? (won ? "text-foreground" : "text-muted-foreground") : "text-foreground/90");
  const ps = final && decidedOnPens(m) ? pensScore(m) : null; // shootout tally for the trailing annotation
  return (
    <Link
      href={localeHref(locale, `/match/${m.match}`)}
      className="hover:bg-muted/30 border-border/40 flex min-h-[40px] shrink-0 items-center gap-1.5 border-r px-4 py-2.5 text-xs whitespace-nowrap sm:min-h-0 sm:py-1.5"
    >
      {live && <span className="bg-live size-1.5 shrink-0 animate-pulse rounded-full" aria-hidden />}
      <Flag code={m.home} size={13} />
      <span className={`font-medium ${nameCls(homeWon)}`}>{m.home}</span>
      {live || final ? (
        <span className="text-foreground font-mono font-semibold tabular-nums">{m.homeScore}<span className="text-muted-2">–</span>{m.awayScore}</span>
      ) : (
        <span className="text-muted-2 px-0.5">{t("scoreTicker.v")}</span>
      )}
      {ps && <span className="text-muted-2 font-mono text-[10px] tabular-nums" title={t("common.wonOnPenalties")}>({ps.home}<span>–</span>{ps.away})</span>}
      <span className={`font-medium ${nameCls(awayWon)}`}>{m.away}</span>
      <Flag code={m.away} size={13} />
      <span className={`ml-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${live ? "text-live" : final ? "text-win" : "text-data-cool"}`} suppressHydrationWarning>
        {live ? (m.liveDetail ?? t("common.live")) : final ? t("scoreTicker.ft") : dayWord ? <>{dayWord} <LocalTime utc={m.utc} mode="timeshort" /></> : <LocalTime utc={m.utc} mode="timeshort" />}
      </span>
    </Link>
  );
}
