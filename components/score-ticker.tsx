import Link from "next/link";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import type { MatchInfo } from "@/lib/predictions";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref, type Locale } from "@/lib/i18n/config";
import type { TFunction } from "@/lib/i18n/server";

// A persistent, auto-scrolling pulse strip under the nav — present on every page. Three states, colour-
// coded for a clear at-a-glance distinction: LIVE (red, pulsing dot + clock) → UPCOMING (cool blue, local
// kickoff time) → FINISHED (green FT + score). Pure CSS marquee (two copies, translate -50%), pauses on
// hover, every item links to its match. Server-rendered; no live win-prob, just real scores and times.
export async function ScoreTicker({ items }: { items: MatchInfo[] }) {
  if (items.length === 0) return null;
  const t = await getT();
  const locale = await getLocale();
  const dur = Math.max(40, items.length * 6); // scale duration with count → consistent scroll speed
  return (
    <div className="border-border/60 bg-background/70 sticky top-14 z-40 overflow-hidden border-b backdrop-blur-xl">
      <div
        className="flex w-max [animation:ticker_var(--d)_linear_infinite] hover:[animation-play-state:paused]"
        style={{ "--d": `${dur}s` } as React.CSSProperties}
      >
        <Track items={items} t={t} locale={locale} />
        <Track items={items} t={t} locale={locale} ariaHidden />
      </div>
    </div>
  );
}

function Track({ items, t, locale, ariaHidden }: { items: MatchInfo[]; t: TFunction; locale: Locale; ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0" aria-hidden={ariaHidden}>
      {items.map((m, i) => <TickerItem key={`${m.match}-${i}`} m={m} t={t} locale={locale} />)}
    </div>
  );
}

function TickerItem({ m, t, locale }: { m: MatchInfo; t: TFunction; locale: Locale }) {
  const live = m.status === "live";
  const final = m.status === "final";
  const homeWon = m.winner != null && m.winner === m.home;
  const awayWon = m.winner != null && m.winner === m.away;
  const nameCls = (won: boolean) => (final ? (won ? "text-foreground" : "text-muted-foreground") : "text-foreground/90");
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
      <span className={`font-medium ${nameCls(awayWon)}`}>{m.away}</span>
      <Flag code={m.away} size={13} />
      <span className={`ml-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${live ? "text-live" : final ? "text-win" : "text-data-cool"}`}>
        {live ? (m.liveDetail ?? t("common.live")) : final ? t("scoreTicker.ft") : <LocalTime utc={m.utc} mode="timeshort" />}
      </span>
    </Link>
  );
}
