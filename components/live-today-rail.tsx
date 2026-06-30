"use client";

import Link from "next/link";
import { Flag } from "@/components/flag";
import { useViewerZone } from "@/lib/useViewerZone";
import { fmtTime, fmtDay, fmtDayKey, forecastPct } from "@/lib/format";
import { decidedOnPens, pensScore } from "@/lib/penalties";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { MatchInfo } from "@/lib/predictions";

// J1 — "what's happening right now", promoted to the top of the homepage. A LIVE NOW band (scores + clock,
// with the model's PRE-MATCH favorite for context — never a fake live %), then a BENTO of labelled columns —
// Today, Tomorrow/Next, Recent results — each a vertical list of match cards. The eye reads top-to-bottom down
// one column at a time (no zigzag across a wrapping grid, no orphan cards). Client-side so the day boundary
// follows the viewer's timezone (no near-midnight hydration mismatch).
export function LiveTodayRail({ matches, hotReasons = {}, className = "" }: { matches: MatchInfo[]; hotReasons?: Record<number, string>; className?: string }) {
  const t = useT();
  const locale = useLocale();
  const { zone, ready } = useViewerZone();
  if (!ready) return null;
  const nowIso = new Date().toISOString();
  const today = fmtDayKey(nowIso, zone);
  const yest = fmtDayKey(new Date(Date.parse(nowIso) - 86400000).toISOString(), zone);

  const live = matches.filter((m) => m.status === "live").sort((a, b) => a.utc.localeCompare(b.utc));
  // Today (chronological) and Recent results = yesterday's finals (most-recent first).
  const todayMatches = matches
    .filter((m) => m.status !== "live" && fmtDayKey(m.utc, zone) === today)
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const recentResults = matches
    .filter((m) => m.status === "final" && fmtDayKey(m.utc, zone) === yest)
    .sort((a, b) => b.utc.localeCompare(a.utc));
  // Forward look — a clean "Tomorrow" slate (times only); on a rest day with nothing tomorrow, fall back to
  // "Coming up": the next scheduled matches, each tagged with its day.
  const tomorrowKey = fmtDayKey(new Date(Date.parse(nowIso) + 86400000).toISOString(), zone);
  const tomorrowMatches = matches
    .filter((m) => m.status === "scheduled" && fmtDayKey(m.utc, zone) === tomorrowKey)
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const laterMatches = matches
    .filter((m) => m.status === "scheduled" && fmtDayKey(m.utc, zone) > tomorrowKey)
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const upcomingIsTomorrow = tomorrowMatches.length > 0;
  const upcoming = upcomingIsTomorrow ? tomorrowMatches : laterMatches;

  // Nothing live, today, upcoming, or recent (e.g. the tournament is over): render nothing.
  if (live.length === 0 && todayMatches.length === 0 && upcoming.length === 0 && recentResults.length === 0) {
    return null;
  }

  // Caps keep each column curated — vertical space is cheap in a column layout, so we can show a fuller list
  // than the old stacked grid, while the full schedule stays one tap away.
  const COL_CAP = 9;

  // Build the bento columns — only the sections that actually have matches, so the grid is 1–3 tiles wide.
  // Ordered as a left-to-right timeline: Recent (past) → Today (present) → Tomorrow/Next (future).
  const columns: ColumnData[] = [];
  if (recentResults.length > 0)
    columns.push({ id: "recent", heading: t("home.recentResults"), matches: recentResults, cap: COL_CAP, showDate: true });
  if (todayMatches.length > 0)
    columns.push({ id: "today", heading: live.length > 0 ? t("home.alsoToday") : t("home.today"), matches: todayMatches, cap: COL_CAP, showFullSchedule: true });
  if (upcoming.length > 0)
    columns.push({ id: "upcoming", heading: upcomingIsTomorrow ? t("home.tomorrow") : t("home.comingUp"), matches: upcoming, cap: COL_CAP, showDate: !upcomingIsTomorrow, showFullSchedule: todayMatches.length === 0 });

  // Today is the focus, so it gets the widest track — a bento where the present is bigger than past/future. A
  // lone column is width-capped so its cards don't stretch full-bleed (which would maroon the win% rail far to
  // the right of the name). On mobile everything stacks into one column.
  const single = columns.length === 1;
  const template = columns.map((c) => (c.id === "today" ? "1.4fr" : "1fr")).join(" ");

  return (
    <section className={className} suppressHydrationWarning>
      {live.length > 0 && (
        <div className="mb-6">
          <h2 className="text-live mb-2.5 flex items-center gap-2 font-mono text-[13px] font-semibold tracking-wide uppercase">
            <span className="bg-live size-2 animate-pulse rounded-full" />{t("common.liveNow")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {live.slice(0, 6).map((m) => <MatchCard key={m.match} m={m} zone={zone} t={t} locale={locale} big />)}
          </div>
        </div>
      )}
      <div
        className={`grid grid-cols-1 items-start gap-x-4 gap-y-6 ${single ? "max-w-2xl" : "lg:[grid-template-columns:var(--bento)]"}`}
        style={single ? undefined : ({ "--bento": template } as React.CSSProperties)}
      >
        {columns.map((c) => (
          <RailColumn key={c.id} {...c} emphasis={c.id === "today"} zone={zone} hotReasons={hotReasons} t={t} locale={locale} />
        ))}
      </div>
    </section>
  );
}

type ColumnData = {
  id: string;
  heading: string;
  matches: MatchInfo[];
  cap: number;
  showFullSchedule?: boolean;
  showDate?: boolean;
};

// One bento column: a section heading, then a vertical list of match cards read top-to-bottom. The emphasized
// (Today) column gets a brighter heading and larger cards so the eye lands there first.
function RailColumn({
  heading, matches, cap, zone, hotReasons, t, locale, showFullSchedule = false, showDate = false, emphasis = false,
}: ColumnData & {
  zone?: import("@/lib/format").Zone;
  hotReasons: Record<number, string>;
  t: TFunction;
  locale: Locale;
  emphasis?: boolean;
}) {
  const shown = matches.slice(0, cap);
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className={`font-mono text-[13px] font-semibold tracking-wide uppercase ${emphasis ? "text-foreground" : "text-foreground/70"}`}>{heading}</h2>
        {showFullSchedule && (
          <Link href={localeHref(locale, "/schedule")} className="text-primary shrink-0 text-xs hover:underline">{t("home.fullSchedule")}</Link>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((m) => <MatchCard key={m.match} m={m} zone={zone} hotReason={hotReasons[m.match]} t={t} locale={locale} showDate={showDate} big={emphasis} />)}
      </div>
      {matches.length > cap && (
        <Link href={localeHref(locale, "/schedule")} className="text-primary mt-2.5 inline-block text-xs hover:underline">{t("home.moreCount", { n: matches.length - cap })}</Link>
      )}
    </div>
  );
}

// One team line: crest + name, then a right-aligned value rail (its win% for upcoming, or its score for
// live/final). Names truncate; the value never does (shrink-0) so it can't be clipped on mobile. The value rail
// is a fixed width so both teams' numbers align in a column one short hop from the name.
function TeamLine({ code, name, strong, dim, value, big = false }: { code: string | null; name: string; strong?: boolean; dim?: boolean; value?: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Flag code={code} size={big ? 20 : 18} />
      <span className={`min-w-0 flex-1 truncate ${big ? "text-sm" : "text-[13px]"} ${strong ? "text-foreground font-semibold" : dim ? "text-muted-foreground" : "text-foreground/90"}`}>{name}</span>
      {value != null && <span className={`shrink-0 text-right font-mono tabular-nums ${big ? "w-11 text-sm" : "w-10 text-[13px]"}`}>{value}</span>}
    </div>
  );
}

// The matchup contest as ONE object: a split bar — home share (pitch-green) from the left, away share
// (data-cool) from the right, the remaining draw/uncertainty as a neutral centre. A glance reads blowout vs.
// finely-balanced without parsing two numbers.
function SplitBar({ h, d, a, big = false }: { h: number; d: number; a: number; big?: boolean }) {
  return (
    <div className={`bg-muted/30 mt-1.5 flex overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5 ${big ? "h-1.5" : "h-1"}`} aria-hidden>
      <span className="bg-primary/40 min-w-[3px]" style={{ width: `${h * 100}%` }} />
      {d > 0 && <span className="bg-muted-foreground/15" style={{ width: `${d * 100}%` }} />}
      <span className="bg-data-cool/35 min-w-[3px]" style={{ width: `${a * 100}%` }} />
    </div>
  );
}

// A single match as a compact card: a small status/time column on the left, the two teams stacked with each
// team's value in an aligned right rail, and — for an upcoming match — one split win-prob bar beneath the
// matchup. A HOT match is flagged with a gold left border (no row-widening badge). Two/three lines tall; the
// prediction reads in one glance with minimal eye travel.
function MatchCard({ m, zone, hotReason, t, locale, showDate = false, big = false }: { m: MatchInfo; zone?: import("@/lib/format").Zone; hotReason?: string; t: TFunction; locale: Locale; showDate?: boolean; big?: boolean }) {
  const live = m.status === "live";
  const final = m.status === "final";
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeName = m.homeName ?? m.projHome?.[0]?.name ?? m.slotHome ?? t("common.tbd");
  const awayName = m.awayName ?? m.projAway?.[0]?.name ?? m.slotAway ?? t("common.tbd");
  const ps = final && decidedOnPens(m) ? pensScore(m) : null;
  const homeWin = final && (m.winner ? m.winner === m.home : ps ? ps.home > ps.away : (m.homeScore ?? 0) > (m.awayScore ?? 0));
  const awayWin = final && (m.winner ? m.winner === m.away : ps ? ps.away > ps.home : (m.awayScore ?? 0) > (m.homeScore ?? 0));
  const favHome = !final && !live && m.favorite?.code === homeCode;
  const favAway = !final && !live && m.favorite?.code === awayCode;
  const wp = m.probs ? { h: m.probs.home, a: m.probs.away } : m.advance ? { h: m.advance.home, a: m.advance.away } : null;
  const split = m.probs ? { h: m.probs.home, d: m.probs.draw, a: m.probs.away } : m.advance ? { h: m.advance.home, d: 0, a: m.advance.away } : null;

  const score = (n?: number, won?: boolean, pen?: number) =>
    n == null ? null : (
      <>
        <span className={live ? "text-live font-bold" : won ? "text-foreground font-bold" : "text-muted-foreground"}>{n}</span>
        {pen != null && <span className="text-muted-2 text-[10px] font-normal"> ({pen})</span>}
      </>
    );
  const odds = (p?: number, fav?: boolean) => (p == null ? null : <span className={fav ? "text-foreground font-semibold" : "text-muted-foreground"}>{forecastPct(p)}</span>);

  return (
    <Link
      href={localeHref(locale, `/match/${m.match}`)}
      title={hotReason}
      className={`group bg-card relative flex items-center gap-3 rounded-lg border transition-colors dark:inset-ring dark:inset-ring-white/5 ${big ? "px-3.5 py-2.5" : "px-3 py-2"} ${live ? "border-live/40 hover:border-live/60" : "border-border hover:border-primary/50"}`}
    >
      {hotReason && !live && <span className="bg-contention/80 absolute inset-y-2 left-0 w-[3px] rounded-full" aria-hidden />}
      <div className="w-10 shrink-0 leading-tight">
        {live ? (
          <span className="text-live inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wide" suppressHydrationWarning><span className="bg-live size-1.5 animate-pulse rounded-full" />{m.liveDetail ?? t("home.liveUpper")}</span>
        ) : final ? (
          <span className="text-win inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wide uppercase"><span className="bg-win size-1.5 rounded-full" />{t("home.ft")}</span>
        ) : (
          <span className="text-muted-2 font-mono text-[11px]" suppressHydrationWarning>{showDate ? fmtDay(m.utc, zone) : fmtTime(m.utc, zone)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="space-y-1">
          <TeamLine code={homeCode} name={homeName} strong={homeWin || favHome} dim={final && !homeWin} value={final || live ? score(m.homeScore, homeWin, ps?.home) : odds(wp?.h, favHome)} big={big} />
          <TeamLine code={awayCode} name={awayName} strong={awayWin || favAway} dim={final && !awayWin} value={final || live ? score(m.awayScore, awayWin, ps?.away) : odds(wp?.a, favAway)} big={big} />
        </div>
        {!final && !live && split && <SplitBar h={split.h} d={split.d} a={split.a} big={big} />}
      </div>
    </Link>
  );
}
