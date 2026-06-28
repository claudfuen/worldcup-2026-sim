"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { HotBadge } from "./hot-badge";
import { TicketLink } from "./ticket-link";
import { fmtTimeShort, fmtDay, fmtDayKey, pct } from "@/lib/format";
import { useViewerZone } from "@/lib/useViewerZone";
import { useT } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref } from "@/lib/i18n/config";
import { fifaVenue } from "@/lib/venues";

const ROUND_KEY: Record<string, string> = {
  GROUP: "rounds.GROUP", R32: "rounds.R32", R16: "rounds.R16", QF: "rounds.QF", SF: "rounds.SF", "3P": "rounds.THIRD", FINAL: "rounds.FINAL",
};

export function ScheduleList({ matches, hotReasons = {} }: { matches: MatchInfo[]; hotReasons?: Record<number, string> }) {
  const t = useT();
  const [filter, setFilter] = useState("all");
  const [time, setTime] = useState("upcoming");
  const { zone } = useViewerZone();
  const FILTERS = [
    { key: "all", label: t("schedule.filterAll") },
    { key: "GROUP", label: t("schedule.filterGroups") },
    { key: "KO", label: t("schedule.filterKnockout") },
  ];
  const TIME_FILTERS = [
    { key: "upcoming", label: t("schedule.timeUpcoming") },
    { key: "past", label: t("schedule.timePast") },
    { key: "all", label: t("schedule.timeAll") },
  ];
  // "today" depends on the wall clock + viewer zone, both of which differ server vs client. Resolve it
  // only after mount so SSR and first client render are identical (no midnight hydration mismatch); the
  // day filter is simply inactive until then.
  const [nowIso, setNowIso] = useState<string | null>(null);
  useEffect(() => setNowIso(new Date().toISOString()), []);
  const today = nowIso ? fmtDayKey(nowIso, zone) : null;
  // A one-day look-back so just-finished and yesterday's matches don't vanish the moment the day rolls over
  // (you can still see yesterday's scores when you check in the next morning).
  const yesterday = nowIso ? fmtDayKey(new Date(Date.parse(nowIso) - 86400000).toISOString(), zone) : null;

  // "Upcoming" is the default, but once nothing is upcoming (a rest day at the very end, or the whole
  // tournament is over) that filter would show an empty "no matches" on a page full of results — so fall
  // back to All dates, turning the page into the archive of record.
  const hasUpcoming = today == null || matches.some((m) => fmtDayKey(m.utc, zone) >= (yesterday ?? today));
  const effectiveTime = time === "upcoming" && !hasUpcoming ? "all" : time;

  const shown = matches.filter((m) => {
    if (filter === "GROUP" && m.round !== "GROUP") return false;
    if (filter === "KO" && m.round === "GROUP") return false;
    if (today != null) {
      const day = fmtDayKey(m.utc, zone);
      if (effectiveTime === "upcoming" && yesterday != null && day < yesterday) return false;
      if (effectiveTime === "past" && day >= today) return false;
    }
    return true;
  });

  // group by the viewer's local day
  const days: { key: string; label: string; items: MatchInfo[] }[] = [];
  for (const m of [...shown].sort((a, b) => a.utc.localeCompare(b.utc))) {
    const key = fmtDayKey(m.utc, zone);
    let d = days.find((x) => x.key === key);
    if (!d) { d = { key, label: fmtDay(m.utc, zone), items: [] }; days.push(d); }
    d.items.push(m);
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <Segmented options={TIME_FILTERS} value={time} onChange={setTime} />
      </div>
      {days.length === 0 && <p className="text-muted-foreground text-sm">{t("schedule.empty")}</p>}
      <div className="space-y-6">
        {days.map((d) => (
          <div key={d.key}>
            <h3 className="text-muted-foreground mb-2 font-mono text-xs font-semibold tracking-wide uppercase" suppressHydrationWarning>{d.label}</h3>
            <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
              {d.items.map((m) => (
                <Row key={m.match} m={m} zone={zone} hotReason={hotReasons[m.match]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ m, zone, hotReason }: { m: MatchInfo; zone?: import("@/lib/format").Zone; hotReason?: string }) {
  const t = useT();
  const locale = useLocale();
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeLabel = m.homeName ?? (m.projHome?.[0] ? `${m.projHome[0].name}` : m.slotHome ?? t("common.tbd"));
  const awayLabel = m.awayName ?? (m.projAway?.[0] ? `${m.projAway[0].name}` : m.slotAway ?? t("common.tbd"));
  const final = m.status === "final";
  const live = m.status === "live";
  const showScore = final || live;
  const upcoming = !final && !live;
  // Full-row link as an overlay so we can also place a real ticket <a> in the row (anchors can't nest).
  // Interactive exceptions (the ticket link) sit above the overlay via relative z-10.
  const homeWin = final && (m.homeScore ?? 0) > (m.awayScore ?? 0);
  const awayWin = final && (m.awayScore ?? 0) > (m.homeScore ?? 0);
  return (
    <div className="hover:bg-muted/30 relative flex items-center gap-3 px-3 py-2.5 transition-colors sm:gap-4 sm:px-4">
      <Link href={localeHref(locale, `/match/${m.match}`)} className="absolute inset-0" aria-label={t("schedule.rowAria", { home: homeLabel, away: awayLabel })} />
      <div className="text-muted-foreground w-14 shrink-0 text-xs sm:w-16">
        <div className="font-mono whitespace-nowrap" suppressHydrationWarning>{fmtTimeShort(m.utc, zone)}</div>
        <div className="text-[10px] leading-tight">{ROUND_KEY[m.round] ? t(ROUND_KEY[m.round]) : m.round}{m.group ? ` ${m.group}` : ""}</div>
      </div>
      {/* Tight matchup unit: flag + name + score stay together (no full-width stretch) */}
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="min-w-0 space-y-0.5">
          <TeamName code={homeCode} label={homeLabel} win={homeWin} projected={!m.home} prob={!m.home ? m.projHome?.[0]?.prob : undefined} />
          <TeamName code={awayCode} label={awayLabel} win={awayWin} projected={!m.away} prob={!m.away ? m.projAway?.[0]?.prob : undefined} />
        </div>
        {showScore && (
          <div className="shrink-0 space-y-0.5 text-center font-mono text-sm tabular-nums">
            <div className={homeWin ? "text-foreground font-bold" : "text-muted-foreground"}>{m.homeScore}</div>
            <div className={awayWin ? "text-foreground font-bold" : "text-muted-foreground"}>{m.awayScore}</div>
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
        {hotReason != null && <HotBadge reason={hotReason} />}
        <div className="text-right">
          {live ? (
            <span className="text-live inline-flex items-center gap-1 text-[11px] font-semibold">
              <span className="bg-live size-1.5 animate-pulse rounded-full" />{t("schedule.liveLabel")} {m.liveDetail}
            </span>
          ) : final ? (
            <span className="text-win text-[11px] font-medium">{t("schedule.fullTime")}</span>
          ) : m.favorite ? (
            <span className="text-muted-foreground text-[11px]">
              <span className="text-foreground/80">{m.favorite.name}</span> {pct(m.favorite.winProb)}
            </span>
          ) : (
            <span className="text-muted-2 text-[11px]">{t("common.projected")}</span>
          )}
          <div className="text-muted-2 hidden max-w-44 truncate text-[10px] sm:block">{fifaVenue(m.venue)}</div>
        </div>
        {upcoming && <TicketLink matchNo={m.match} placement="schedule_row" variant="inline" className="relative z-10 -my-2 px-1 py-2" />}
      </div>
    </div>
  );
}

function TeamName({ code, label, win, projected, prob }: { code: string | null; label: string; win?: boolean; projected?: boolean; prob?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Flag code={code} size={18} />
      <span className={`max-w-[150px] truncate text-sm sm:max-w-[260px] ${win ? "font-semibold" : projected ? "text-foreground/75" : ""}`}>
        {label}
        {projected && prob != null && <span className="text-muted-2 ml-1 font-mono text-[10px]">{pct(Math.min(prob, 0.99))}</span>}
      </span>
    </div>
  );
}

// A compact segmented control (a single track with a raised active segment) — reads more intentional than
// a row of separate pills.
function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="border-border bg-muted/30 flex w-full shrink-0 rounded-lg border p-0.5 sm:inline-flex sm:w-auto">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`flex-1 rounded-[0.3rem] px-3 py-2 text-sm whitespace-nowrap sm:flex-none sm:py-1 ${
            value === o.key ? "bg-surface-raised text-foreground inset-ring inset-ring-white/10 font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
