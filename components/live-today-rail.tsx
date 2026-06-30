"use client";

import Link from "next/link";
import { Flag } from "@/components/flag";
import { useViewerZone } from "@/lib/useViewerZone";
import { fmtTime, fmtTimeShort, fmtDay, fmtDayKey, pct, forecastPct } from "@/lib/format";
import { HotBadge } from "@/components/hot-badge";
import { decidedOnPens, pensScore } from "@/lib/penalties";
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

  // Chronological top-to-bottom: LIVE → TODAY → TOMORROW/UPCOMING → RECENT. Each section is a responsive grid
  // of match CARDS (Apple-Sports-style card-per-event; teams stacked with an aligned score/odds column).
  return (
    <section className={className} suppressHydrationWarning>
      {live.length > 0 && (
        <div className="mb-6">
          <h2 className="text-live mb-2.5 flex items-center gap-2 font-mono text-[13px] font-semibold tracking-wide uppercase">
            <span className="bg-live size-2 animate-pulse rounded-full" />{t("common.liveNow")}
          </h2>
          <div className={`grid gap-2 ${wide ? "sm:grid-cols-2" : ""}`}>
            {live.slice(0, 6).map((m) => <MatchCard key={m.match} m={m} zone={zone} t={t} locale={locale} />)}
          </div>
        </div>
      )}
      {todayMatches.length > 0 && (
        <RailSection wide={wide} heading={live.length > 0 ? t("home.alsoToday") : t("home.today")} showFullSchedule matches={todayMatches} cap={TODAY_CAP} zone={zone} hotReasons={hotReasons} t={t} locale={locale} />
      )}
      {upcoming.length > 0 && (
        <RailSection wide={wide} heading={upcomingIsTomorrow ? t("home.tomorrow") : t("home.comingUp")} showFullSchedule={live.length === 0 && todayMatches.length === 0} matches={upcoming} cap={UPCOMING_CAP} zone={zone} hotReasons={hotReasons} t={t} locale={locale} showDate={!upcomingIsTomorrow} kickoff={!upcomingIsTomorrow} />
      )}
      {recentResults.length > 0 && (
        <RailSection wide={wide} heading={t("home.recentResults")} matches={recentResults} cap={RECENT_CAP} zone={zone} hotReasons={hotReasons} t={t} locale={locale} showDate />
      )}
    </section>
  );
}

// One labelled slate (heading + card of rows + overflow link). Used for both "Today" and "Recent results".
function RailSection({
  heading, matches, cap, zone, hotReasons, t, locale, showFullSchedule = false, showDate = false, kickoff = false, wide = false,
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
  wide?: boolean;
}) {
  const shown = matches.slice(0, cap);
  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h2 className="text-foreground/85 font-mono text-[13px] font-semibold tracking-wide uppercase">{heading}</h2>
        {showFullSchedule && (
          <Link href={localeHref(locale, "/schedule")} className="text-primary text-xs hover:underline">{t("home.fullSchedule")}</Link>
        )}
      </div>
      <div className={`grid gap-2 ${wide ? "sm:grid-cols-2" : ""}`}>
        {shown.map((m) => <MatchCard key={m.match} m={m} zone={zone} hotReason={hotReasons[m.match]} t={t} locale={locale} showDate={showDate} kickoff={kickoff} />)}
      </div>
      {matches.length > cap && (
        <Link href={localeHref(locale, "/schedule")} className="text-primary mt-2.5 inline-block text-xs hover:underline">{t("home.moreCount", { n: matches.length - cap })}</Link>
      )}
    </div>
  );
}

// One team line inside a card: crest + name (winner/favorite bold, the other side dimmed on a finished match),
// an optional win-probability mini-bar (so the favorite reads at a glance), and a right-aligned value (its
// win% for an upcoming match, or its score for a live/final one).
function TeamLine({ code, name, strong, dim, value, valueClass = "", barFrac, barStrong }: { code: string | null; name: string; strong?: boolean; dim?: boolean; value?: React.ReactNode; valueClass?: string; barFrac?: number; barStrong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Flag code={code} size={20} />
      <span className={`min-w-0 flex-1 truncate text-sm ${strong ? "font-semibold" : dim ? "text-muted-foreground" : "text-foreground/90"}`}>{name}</span>
      {barFrac != null && (
        <span className="bg-muted/60 relative hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full sm:inline-block dark:inset-ring dark:inset-ring-white/5" aria-hidden>
          <span className={`absolute inset-y-0 left-0 rounded-full ${barStrong ? "bg-primary/80" : "bg-muted-foreground/45"}`} style={{ width: `${Math.max(3, barFrac * 100)}%` }} />
        </span>
      )}
      {value != null && <span className={`w-9 shrink-0 text-right font-mono tabular-nums ${valueClass}`}>{value}</span>}
    </div>
  );
}

// A single match as a COMPACT row (Apple-Sports home-list style): a small status/time column, the two teams
// stacked, and each team's value aligned right — its score (final/live) or its win/advance probability
// (upcoming), with the winner/favorite bold. Two lines tall; reads as a tight chronological stack.
function MatchCard({ m, zone, hotReason, t, locale, showDate = false, kickoff = false }: { m: MatchInfo; zone?: import("@/lib/format").Zone; hotReason?: string; t: TFunction; locale: Locale; showDate?: boolean; kickoff?: boolean }) {
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
  // Per-team win/advance probability for an upcoming match (group win%, else KO to-advance %).
  const wp = m.probs ? { h: m.probs.home, a: m.probs.away } : m.advance ? { h: m.advance.home, a: m.advance.away } : null;

  const score = (n?: number, won?: boolean, pen?: number) =>
    n == null ? null : (
      <span className={live ? "text-live font-bold" : won ? "text-foreground font-bold" : "text-muted-foreground"}>
        {n}{pen != null && <span className="text-muted-2 text-[11px] font-normal"> ({pen})</span>}
      </span>
    );
  const odds = (p?: number, strong?: boolean) => (p == null ? null : <span className={strong ? "text-foreground/90 font-semibold" : "text-muted-2"}>{forecastPct(p)}</span>);
  const homeVal = live || final ? score(m.homeScore, homeWin, ps?.home) : odds(wp?.h, favHome);
  const awayVal = live || final ? score(m.awayScore, awayWin, ps?.away) : odds(wp?.a, favAway);

  return (
    <Link href={localeHref(locale, `/match/${m.match}`)} className={`group bg-card flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${live ? "border-live/40 hover:border-live/60" : "border-border hover:border-primary/50"} dark:inset-ring dark:inset-ring-white/5`}>
      <div className="w-12 shrink-0 text-left">
        {live ? (
          <span className="text-live inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wide" suppressHydrationWarning><span className="bg-live size-1.5 animate-pulse rounded-full" />{m.liveDetail ?? t("home.liveUpper")}</span>
        ) : final ? (
          <span className="text-win font-mono text-[10px] font-semibold tracking-wide uppercase">{t("home.ft")}</span>
        ) : (
          <span className="text-muted-2 font-mono text-[11px] leading-tight" suppressHydrationWarning>{showDate ? fmtDay(m.utc, zone) : fmtTime(m.utc, zone)}{kickoff ? <><br />{fmtTimeShort(m.utc, zone)}</> : ""}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <TeamLine code={homeCode} name={homeName} strong={homeWin || favHome} dim={final && !homeWin} value={homeVal} valueClass="text-sm" barFrac={!final && !live ? wp?.h : undefined} barStrong={favHome} />
        <TeamLine code={awayCode} name={awayName} strong={awayWin || favAway} dim={final && !awayWin} value={awayVal} valueClass="text-sm" barFrac={!final && !live ? wp?.a : undefined} barStrong={favAway} />
      </div>
      {hotReason != null && <HotBadge reason={hotReason} className="shrink-0 self-start" />}
    </Link>
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
  const ps = final && decidedOnPens(m) ? pensScore(m) : null;
  // Emphasis cue so the row is skimmable at a glance: the winner (final) or the model's favorite (upcoming) is
  // bold; the other side dims on a finished match.
  const homeWin = final && (m.winner ? m.winner === m.home : (ps ? ps.home > ps.away : (m.homeScore ?? 0) > (m.awayScore ?? 0)));
  const awayWin = final && (m.winner ? m.winner === m.away : (ps ? ps.away > ps.home : (m.awayScore ?? 0) > (m.homeScore ?? 0)));
  const homeStrong = homeWin || (!final && m.favorite?.name === homeName);
  const awayStrong = awayWin || (!final && m.favorite?.name === awayName);
  const teamCls = (strong: boolean) => `truncate ${strong ? "text-foreground font-semibold" : final ? "text-muted-foreground" : "text-foreground/85"}`;
  return (
    <Link href={localeHref(locale, `/match/${m.match}`)} className="hover:bg-muted/20 flex items-center gap-2.5 px-4 py-2.5 sm:gap-3">
      <span className={`text-muted-2 shrink-0 font-mono text-[11px] ${showDate ? "whitespace-nowrap" : "w-14 sm:w-16"}`} suppressHydrationWarning>
        {showDate ? fmtDay(m.utc, zone) : fmtTime(m.utc, zone)}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Flag code={homeCode} size={18} />
        <span className={teamCls(homeStrong)}>{homeName}</span>
        <span className="text-muted-2 shrink-0 text-xs">{t("home.versusShort")}</span>
        <Flag code={awayCode} size={18} />
        <span className={teamCls(awayStrong)}>{awayName}</span>
      </div>
      {hotReason != null && <HotBadge reason={hotReason} className="shrink-0" />}
      <span className="shrink-0 text-right">
        {final ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="border-border-strong bg-surface-raised text-foreground inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-sm font-bold tabular-nums">
              {m.homeScore}<span className="text-muted-2 px-0.5">–</span>{m.awayScore}
            </span>
            {ps ? <span className="text-muted-2 font-mono text-[10px] tabular-nums">{t("common.penScore", { home: ps.home, away: ps.away })}</span> : null}
            <span className="text-win font-mono text-[10px] font-semibold">{t("home.ft")}</span>
          </span>
        ) : kickoff ? (
          <span className="border-border text-foreground/80 inline-block rounded-md border px-2 py-0.5 font-mono text-[11px] tabular-nums" suppressHydrationWarning>{fmtTimeShort(m.utc, zone)}</span>
        ) : m.favorite ? (
          <span className="inline-flex items-center gap-1.5" title={t("home.preMatch", { name: m.favorite.name, pct: pct(m.favorite.winProb) })}>
            <span className="bg-muted/60 relative hidden h-1.5 w-12 overflow-hidden rounded-full sm:inline-block">
              <span className="bg-primary/70 absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(Math.min(m.favorite.winProb, 0.99) * 100)}%` }} />
            </span>
            <span className="text-foreground/75 w-8 text-right font-mono text-[11px] tabular-nums">{pct(m.favorite.winProb)}</span>
          </span>
        ) : (
          <span className="text-muted-2 text-[11px]">{t("home.projectedLower")}</span>
        )}
      </span>
    </Link>
  );
}
