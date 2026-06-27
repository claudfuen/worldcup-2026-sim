"use client";

import Link from "next/link";
import { Flag } from "@/components/flag";
import { useViewerZone } from "@/lib/useViewerZone";
import { fmtTime, fmtDayKey, pct } from "@/lib/format";
import { HotBadge } from "@/components/hot-badge";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { MatchInfo } from "@/lib/predictions";

// J1 — "what's happening right now", promoted to the top of the homepage. A LIVE NOW lane (scores + clock,
// with the model's PRE-MATCH favorite shown for context — never a fake live %), then a compact today/
// last-night slate. Curated and capped, never the full schedule. Client-side so the day boundary follows
// the viewer's timezone (no near-midnight hydration mismatch).
export function LiveTodayRail({ matches, hotReasons = {}, className = "" }: { matches: MatchInfo[]; hotReasons?: Record<number, string>; className?: string }) {
  const t = useT();
  const locale = useLocale();
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
        <h2 className="text-muted-foreground mb-2 font-mono text-xs font-semibold tracking-wide uppercase">{t("home.upNext")}</h2>
        <div className="border-border bg-card overflow-hidden rounded-2xl border">
          <SlateRow m={next} zone={zone} today={today} hotReason={hotReasons[next.match]} t={t} locale={locale} />
        </div>
      </section>
    );
  }

  // Room for the full day plus several last-night results — also lets the rail balance the homepage's
  // right-hand snapshot column (stage/bracket/groups/title) so the dashboard's two columns end together.
  const CAP = 10;
  const shownSlate = slate.slice(0, CAP);
  const hasLastNight = shownSlate.some((m) => m.status === "final" && fmtDayKey(m.utc, zone) === yest);
  const slateLabel = live.length > 0 ? t("home.alsoToday") : hasLastNight ? t("home.todayAndLastNight") : t("home.today");

  return (
    <section className={className} suppressHydrationWarning>
      {live.length > 0 && (
        <div className="mb-5">
          <h2 className="text-live mb-2 flex items-center gap-2 font-mono text-xs font-semibold tracking-wide uppercase">
            <span className="bg-live size-1.5 animate-pulse rounded-full" />{t("common.liveNow")}
          </h2>
          <div className="border-live/45 bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
            {live.slice(0, 3).map((m) => <LiveRow key={m.match} m={m} t={t} locale={locale} />)}
          </div>
          {live.length > 3 && (
            <Link href={localeHref(locale, "/schedule")} className="text-primary mt-2 inline-block text-xs hover:underline">{t("home.moreLive", { n: live.length - 3 })}</Link>
          )}
        </div>
      )}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">{slateLabel}</h2>
        <Link href={localeHref(locale, "/schedule")} className="text-primary text-xs hover:underline">{t("home.fullSchedule")}</Link>
      </div>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
        {shownSlate.map((m) => <SlateRow key={m.match} m={m} zone={zone} today={today} hotReason={hotReasons[m.match]} t={t} locale={locale} />)}
      </div>
      {slate.length > CAP && (
        <Link href={localeHref(locale, "/schedule")} className="text-primary mt-2 inline-block text-xs hover:underline">{t("home.moreCount", { n: slate.length - CAP })}</Link>
      )}
    </section>
  );
}

function LiveRow({ m, t, locale }: { m: MatchInfo; t: TFunction; locale: Locale }) {
  return (
    <Link href={localeHref(locale, `/match/${m.match}`)} className="hover:bg-live/[0.08] bg-live/[0.04] block px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <Flag code={m.home} size={20} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.homeName}</span>
        <span className="shrink-0 px-1.5 font-mono text-lg font-bold tabular-nums">{m.homeScore}<span className="text-muted-2">–</span>{m.awayScore}</span>
        <Flag code={m.away} size={20} />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{m.awayName}</span>
        <span className="text-live ml-auto inline-flex shrink-0 basis-full items-center justify-end gap-1.5 font-mono text-xs font-bold tracking-wide sm:basis-auto">
          <span className="bg-live size-2 animate-pulse rounded-full" />{m.liveDetail ?? t("home.liveUpper")}
        </span>
      </div>
      {m.favorite && <div className="text-muted-2 mt-1.5 truncate text-[11px]">{t("home.preMatch", { name: m.favorite.name, pct: pct(m.favorite.winProb) })}</div>}
    </Link>
  );
}

function SlateRow({ m, zone, today, hotReason, t, locale }: { m: MatchInfo; zone?: import("@/lib/format").Zone; today: string; hotReason?: string; t: TFunction; locale: Locale }) {
  const final = m.status === "final";
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeName = m.homeName ?? m.projHome?.[0]?.name ?? m.slotHome ?? t("common.tbd");
  const awayName = m.awayName ?? m.projAway?.[0]?.name ?? m.slotAway ?? t("common.tbd");
  const isYesterday = final && fmtDayKey(m.utc, zone) !== today;
  return (
    <Link href={localeHref(locale, `/match/${m.match}`)} className="hover:bg-muted/20 flex items-center gap-2 px-4 py-2.5 sm:gap-3">
      <span className="text-muted-2 w-12 shrink-0 font-mono text-[11px] sm:w-16" suppressHydrationWarning>
        {isYesterday ? t("home.lastNight") : fmtTime(m.utc, zone)}
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
        ) : m.favorite ? (
          <span className="text-muted-2"><span className="text-foreground/80">{m.favorite.name}</span> {pct(m.favorite.winProb)}</span>
        ) : (
          <span className="text-muted-2">{t("home.projectedLower")}</span>
        )}
      </span>
    </Link>
  );
}
