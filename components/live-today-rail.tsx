"use client";

import Link from "next/link";
import { Flag } from "@/components/flag";
import { useViewerZone } from "@/lib/useViewerZone";
import { fmtTime, fmtTimeShort, fmtDay, fmtDayKey, pct, forecastPct } from "@/lib/format";
import { HotBadge } from "@/components/hot-badge";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { MatchInfo } from "@/lib/predictions";

// J1 — "what's happening right now", promoted to the top of the homepage. A LIVE NOW lane (scores + clock,
// with the model's PRE-MATCH favorite shown for context — never a fake live %), then a compact today/
// last-night slate. Curated and capped, never the full schedule. Client-side so the day boundary follows
// the viewer's timezone (no near-midnight hydration mismatch).
export function LiveTodayRail({ matches, hotReasons = {}, className = "", wide = false }: { matches: MatchInfo[]; hotReasons?: Record<number, string>; className?: string; wide?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { zone, ready } = useViewerZone();
  if (!ready) return null;
  const nowIso = new Date().toISOString();
  const today = fmtDayKey(nowIso, zone);
  const yest = fmtDayKey(new Date(Date.parse(nowIso) - 86400000).toISOString(), zone);

  const live = matches.filter((m) => m.status === "live").sort((a, b) => a.utc.localeCompare(b.utc));
  // Two clearly-separated slates (easier to parse than one combined list): TODAY (chronological) and
  // RECENT RESULTS = yesterday's finals (most-recent first).
  const todayMatches = matches
    .filter((m) => m.status !== "live" && fmtDayKey(m.utc, zone) === today)
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const recentResults = matches
    .filter((m) => m.status === "final" && fmtDayKey(m.utc, zone) === yest)
    .sort((a, b) => b.utc.localeCompare(a.utc));
  // Forward look — sparser knockout days leave room to see what's next. Prefer a clean "Tomorrow" slate
  // (times only); on a rest day with nothing tomorrow, fall back to "Coming up": the next scheduled
  // matches, each tagged with its day so you can see when to tune in.
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

  // Caps keep the rail curated — a glimpse, never the full schedule (which is one tap away).
  const TODAY_CAP = 10;
  const UPCOMING_CAP = 8;
  const RECENT_CAP = 6;

  return (
    // `wide` flows the feed's sections into balanced internal columns so a full-width primary feed never
    // shows airy half-empty rows (and keeps each section intact with break-inside-avoid).
    <section className={`${className} ${wide ? "md:columns-2 md:gap-x-6 lg:gap-x-8" : ""}`} suppressHydrationWarning>
      {live.length > 0 && (
        <div className="mb-5 break-inside-avoid">
          <h2 className="text-live mb-2 flex items-center gap-2 font-mono text-[13px] font-semibold tracking-wide uppercase">
            <span className="bg-live size-2 animate-pulse rounded-full" />{t("common.liveNow")}
          </h2>
          <div className="border-live/45 bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
            {live.slice(0, 3).map((m) => <LiveRow key={m.match} m={m} t={t} locale={locale} />)}
          </div>
          {live.length > 3 && (
            <Link href={localeHref(locale, "/schedule")} className="text-primary mt-2 inline-block text-xs hover:underline">{t("home.moreLive", { n: live.length - 3 })}</Link>
          )}
        </div>
      )}
      {todayMatches.length > 0 && (
        <RailSection
          heading={live.length > 0 ? t("home.alsoToday") : t("home.today")}
          showFullSchedule
          matches={todayMatches}
          cap={TODAY_CAP}
          zone={zone}
          hotReasons={hotReasons}
          t={t}
          locale={locale}
        />
      )}
      {upcoming.length > 0 && (
        <RailSection
          heading={upcomingIsTomorrow ? t("home.tomorrow") : t("home.comingUp")}
          showFullSchedule={live.length === 0 && todayMatches.length === 0}
          matches={upcoming}
          cap={UPCOMING_CAP}
          zone={zone}
          hotReasons={hotReasons}
          t={t}
          locale={locale}
          showDate={!upcomingIsTomorrow}
          kickoff={!upcomingIsTomorrow}
        />
      )}
      {recentResults.length > 0 && (
        <RailSection
          heading={t("home.recentResults")}
          matches={recentResults}
          cap={RECENT_CAP}
          zone={zone}
          hotReasons={hotReasons}
          t={t}
          locale={locale}
          showDate
        />
      )}
    </section>
  );
}

// One labelled slate (heading + card of rows + overflow link). Used for both "Today" and "Recent results".
function RailSection({
  heading, matches, cap, zone, hotReasons, t, locale, showFullSchedule = false, showDate = false, kickoff = false,
}: {
  heading: string;
  matches: MatchInfo[];
  cap: number;
  zone?: import("@/lib/format").Zone;
  hotReasons: Record<number, string>;
  t: TFunction;
  locale: Locale;
  showFullSchedule?: boolean;
  showDate?: boolean;
  kickoff?: boolean;
}) {
  const shown = matches.slice(0, cap);
  return (
    <div className="mb-5 break-inside-avoid last:mb-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-foreground/85 font-mono text-[13px] font-semibold tracking-wide uppercase">{heading}</h2>
        {showFullSchedule && (
          <Link href={localeHref(locale, "/schedule")} className="text-primary text-xs hover:underline">{t("home.fullSchedule")}</Link>
        )}
      </div>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
        {shown.map((m) => <SlateRow key={m.match} m={m} zone={zone} hotReason={hotReasons[m.match]} t={t} locale={locale} showDate={showDate} kickoff={kickoff} />)}
      </div>
      {matches.length > cap && (
        <Link href={localeHref(locale, "/schedule")} className="text-primary mt-2 inline-block text-xs hover:underline">{t("home.moreCount", { n: matches.length - cap })}</Link>
      )}
    </div>
  );
}

function LiveRow({ m, t, locale }: { m: MatchInfo; t: TFunction; locale: Locale }) {
  return (
    <Link href={localeHref(locale, `/match/${m.match}`)} className="hover:bg-live/[0.08] bg-live/[0.04] block px-4 py-3">
      {/* Left-anchored matchup + score; the live clock is a quiet element pinned to the right of the row.
          On narrow mobile it wraps below so the two team names keep their width and stay legible. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Flag code={m.home} size={20} />
        <span className="min-w-0 shrink truncate text-[15px] font-semibold">{m.homeName}</span>
        <span className="shrink-0 px-1 font-mono text-base font-bold tabular-nums">{m.homeScore}<span className="text-muted-2 px-0.5">–</span>{m.awayScore}</span>
        <Flag code={m.away} size={20} />
        <span className="min-w-0 shrink truncate text-[15px] font-semibold">{m.awayName}</span>
        <span className="text-live inline-flex shrink-0 items-center gap-1.5 ps-2 font-mono text-xs font-bold tracking-wide max-sm:ms-7 max-sm:basis-full max-sm:ps-0 sm:ms-auto">
          <span className="bg-live size-2 animate-pulse rounded-full" />{m.liveDetail ?? t("home.liveUpper")}
        </span>
      </div>
      <LiveOdds m={m} t={t} />
    </Link>
  );
}

// For an in-progress match: the model's CURRENT win probability (conditioned on the live score + minute)
// led primary, with the pre-match favorite kept beneath for context. Falls back to pre-match only when the
// live read isn't available (unknown clock).
function LiveOdds({ m, t }: { m: MatchInfo; t: TFunction }) {
  const lp = m.liveProbs;
  const live = lp ? (lp.home >= lp.away ? { name: m.homeName, p: lp.home } : { name: m.awayName, p: lp.away }) : null;
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px]">
      {live && (
        <span className="text-foreground/80 truncate">
          {/* forecastPct: never show a live match as 100% — cap at 99% (it can still swing) */}
          {t("home.liveProb", { name: live.name, pct: forecastPct(live.p) })}
        </span>
      )}
      {m.favorite && (
        <span className="text-muted-2 truncate">{t("home.preMatch", { name: m.favorite.name, pct: pct(m.favorite.winProb) })}</span>
      )}
    </div>
  );
}

function SlateRow({ m, zone, hotReason, t, locale, showDate = false, kickoff = false }: { m: MatchInfo; zone?: import("@/lib/format").Zone; hotReason?: string; t: TFunction; locale: Locale; showDate?: boolean; kickoff?: boolean }) {
  const final = m.status === "final";
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeName = m.homeName ?? m.projHome?.[0]?.name ?? m.slotHome ?? t("common.tbd");
  const awayName = m.awayName ?? m.projAway?.[0]?.name ?? m.slotAway ?? t("common.tbd");
  return (
    <Link href={localeHref(locale, `/match/${m.match}`)} className="hover:bg-muted/20 flex items-center gap-2 px-4 py-2.5 sm:gap-3">
      <span className={`text-muted-2 shrink-0 font-mono text-[11px] ${showDate ? "whitespace-nowrap" : "w-14 sm:w-16"}`} suppressHydrationWarning>
        {showDate ? fmtDay(m.utc, zone) : fmtTime(m.utc, zone)}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Flag code={homeCode} size={16} />
        <span className="truncate">{homeName}</span>
        <span className="text-muted-2 shrink-0 text-xs">{t("home.versusShort")}</span>
        <Flag code={awayCode} size={16} />
        <span className="truncate">{awayName}</span>
      </div>
      {hotReason != null && <HotBadge reason={hotReason} className="shrink-0" />}
      <span className="shrink-0 text-right text-[11px]">
        {final ? (
          <span className="font-mono"><span className="text-foreground font-medium tabular-nums">{m.homeScore}–{m.awayScore}</span> <span className="text-win">{t("home.ft")}</span></span>
        ) : kickoff ? (
          <span className="text-foreground/80 font-mono tabular-nums" suppressHydrationWarning>{fmtTimeShort(m.utc, zone)}</span>
        ) : m.favorite ? (
          <span className="text-muted-2"><span className="text-foreground/80">{m.favorite.name}</span> {pct(m.favorite.winProb)}</span>
        ) : (
          <span className="text-muted-2">{t("home.projectedLower")}</span>
        )}
      </span>
    </Link>
  );
}
