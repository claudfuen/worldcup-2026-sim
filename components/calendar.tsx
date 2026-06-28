"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MatchInfo, SlotCandidate } from "@/lib/predictions";
import { Flag } from "./flag";
import { fmtTimeShort, fmtDay, fmtDayKey, pct } from "@/lib/format";
import { useViewerZone } from "@/lib/useViewerZone";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { fifaVenue } from "@/lib/venues";

const ROUND_KEY: Record<string, string> = {
  GROUP: "rounds.GROUP", R32: "rounds.R32", R16: "rounds.R16", QF: "rounds.QF", SF: "rounds.SF", "3P": "rounds.THIRD", FINAL: "rounds.FINAL",
};

// Each phase gets a distinct accent so its date span reads as a colored "lane" (an all-day bar across the
// week, plus a legend). Order = tournament order. Desaturated for the dark theme.
const PHASES = [
  { key: "GROUP", color: "#64748b" },
  { key: "R32", color: "#34d399" },
  { key: "R16", color: "#38bdf8" },
  { key: "QF", color: "#a78bfa" },
  { key: "SF", color: "#fbbf24" },
  { key: "THIRD", color: "#fb7185" },
  { key: "FINAL", color: "#facc15" },
] as const;
const PHASE_COLOR: Record<string, string> = Object.fromEntries(PHASES.map((p) => [p.key, p.color]));
const phaseKeyOf = (round: string) => (round === "3P" ? "THIRD" : round);
const mix = (color: string, p: number) => `color-mix(in oklab, ${color} ${p}%, transparent)`;
const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function Calendar({ matches }: { matches: MatchInfo[] }) {
  const t = useT();
  const locale = useLocale();
  const { zone } = useViewerZone();
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  useEffect(() => setTodayKey(fmtDayKey(new Date().toISOString(), zone)), [zone]);
  const mounted = todayKey != null;

  // Matches bucketed by viewer-local day; phase date-ranges (so even rest days inside a phase are colored).
  const byDay = new Map<string, MatchInfo[]>();
  const phaseRange: Record<string, { min: string; max: string }> = {};
  for (const m of [...matches].sort((a, b) => a.utc.localeCompare(b.utc))) {
    const key = fmtDayKey(m.utc, zone);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(m);
    const ph = phaseKeyOf(m.round);
    const r = (phaseRange[ph] ??= { min: key, max: key });
    if (key < r.min) r.min = key;
    if (key > r.max) r.max = key;
  }
  const phaseForKey = (key: string): string | null => {
    for (const p of PHASES) {
      const r = phaseRange[p.key];
      if (r && key >= r.min && key <= r.max) return p.key;
    }
    return null;
  };
  const allKeys = [...byDay.keys()].sort();
  const firstKey = allKeys[0] ?? "2026-06-11";
  const lastKey = allKeys[allKeys.length - 1] ?? "2026-07-19";

  const loc = zone.locale;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(loc, { weekday: "short" }).format(new Date(2024, 0, 1 + i)), // Mon-start
  );
  const shortDate = (d: Date) => new Intl.DateTimeFormat(loc, { month: "short", day: "numeric" }).format(d);

  // Build continuous Monday-aligned weeks covering the tournament span.
  const start = new Date(2026, 5, 1); // June 1, 2026
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const weeks: { days: Date[]; first: string; last: string }[] = [];
  for (let w = new Date(start); ; w.setDate(w.getDate() + 7)) {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(w); d.setDate(d.getDate() + i); return d; });
    const first = dateKey(days[0]);
    const last = dateKey(days[6]);
    if (first > lastKey) break;
    if (last >= firstKey) weeks.push({ days: days.map((d) => new Date(d)), first, last });
    if (weeks.length > 12) break; // safety
  }
  const hasPast = mounted && weeks.some((wk) => wk.last < todayKey!);
  const futureWeeks = mounted && !showPast ? weeks.filter((wk) => wk.last >= todayKey!) : weeks;
  // Once every week is in the past (tournament over), "future only" would render a blank calendar — fall
  // back to the full set so the page stays the complete archive.
  const visibleWeeks = futureWeeks.length > 0 ? futureWeeks : weeks;
  // Same fallback for the mobile agenda's day keys.
  const futureKeys = mounted && !showPast ? allKeys.filter((k) => k >= todayKey!) : allKeys;
  const visibleKeys = futureKeys.length > 0 ? futureKeys : allKeys;
  const present = new Set([...matches].map((m) => phaseKeyOf(m.round)));

  // Consecutive same-phase day runs within a week → one all-day bar each (Google-Calendar style).
  const runsFor = (days: Date[]) => {
    const ph = days.map((d) => phaseForKey(dateKey(d)));
    const runs: { phase: string; start: number; len: number }[] = [];
    for (let i = 0; i < 7; ) {
      if (!ph[i]) { i++; continue; }
      let j = i;
      while (j < 7 && ph[j] === ph[i]) j++;
      runs.push({ phase: ph[i]!, start: i, len: j - i });
      i = j;
    }
    return runs;
  };

  const showEarlier = hasPast && !showPast && (
    <button type="button" onClick={() => setShowPast(true)} className="text-muted-foreground hover:text-foreground border-border/70 hover:border-border mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
      {t("calendar.showEarlier")}
    </button>
  );

  return (
    <div suppressHydrationWarning>
      {/* Phase legend — pinned below the nav + score ticker on desktop so the colour key stays visible
          deep in the calendar (mobile labels the phase inline in each day header, so it's a plain bar there). */}
      <div className="bg-background/90 border-border/40 z-20 -mx-4 mb-4 border-b px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 md:sticky md:top-14 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {PHASES.filter((p) => present.has(p.key)).map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1.5 text-xs">
              <span className="h-2 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: mix(p.color, 55) }} aria-hidden />
              <span className="text-muted-foreground">{t(`rounds.${p.key}`)}</span>
            </span>
          ))}
        </div>
      </div>

      {showEarlier}

      {/* Desktop: week rows, each with an all-day phase bar above the day cells */}
      <div className="hidden space-y-6 md:block">
        {visibleWeeks.map((wk) => (
          <div key={wk.first}>
            <div className="text-muted-2 mb-1.5 font-mono text-[11px]">{shortDate(wk.days[0])} – {shortDate(wk.days[6])}</div>
            {/* all-day phase bars */}
            <div className="mb-1 grid grid-cols-7 gap-1.5">
              {runsFor(wk.days).map((run) => (
                <div
                  key={run.start}
                  style={{ gridColumn: `${run.start + 1} / span ${run.len}`, backgroundColor: mix(PHASE_COLOR[run.phase], 16), color: PHASE_COLOR[run.phase] }}
                  className="flex h-5 items-center overflow-hidden rounded px-2 text-[10px] font-semibold tracking-wide uppercase"
                >
                  <span className="truncate">{t(`rounds.${run.phase}`)}</span>
                </div>
              ))}
            </div>
            {/* day cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {wk.days.map((d) => {
                const key = dateKey(d);
                const inRange = key >= "2026-06-01" && key <= "2026-07-31";
                if (!inRange) return <div key={key} className="min-h-24 rounded-lg" />;
                const items = byDay.get(key) ?? [];
                const isToday = key === todayKey;
                const phase = phaseForKey(key);
                const color = phase ? PHASE_COLOR[phase] : null;
                return (
                  <div
                    key={key}
                    className={`min-h-24 rounded-lg border p-1 ${isToday ? "border-primary ring-primary/30 ring-2" : "border-border/40"}`}
                    style={color ? { backgroundColor: mix(color, isToday ? 9 : 5) } : undefined}
                  >
                    <div className="mb-1 flex items-center gap-1 px-0.5">
                      {isToday && <span className="text-primary text-[9px] font-bold tracking-wide uppercase">{t("calendar.today")}</span>}
                      <span className={`ml-auto font-mono text-[11px] ${isToday ? "bg-primary text-background flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-bold" : "text-muted-foreground"}`}>{d.getDate()}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map((m) => <MatchCard key={m.match} m={m} zone={zone} locale={locale} t={t} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: agenda grouped by day, present-focused, each header carrying its phase */}
      <div className="space-y-6 md:hidden">
        {visibleKeys.map((key) => {
          const items = byDay.get(key)!;
          const isToday = key === todayKey;
          const phase = phaseKeyOf(items[0].round);
          const color = PHASE_COLOR[phase];
          return (
            <section key={key} className={isToday ? "border-primary/40 bg-primary/[0.05] -mx-2 rounded-2xl border px-3 py-3" : ""}>
              <h2 className="mb-2 flex items-center gap-2 font-mono text-xs font-semibold tracking-wide uppercase" suppressHydrationWarning>
                <span className="h-2 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: mix(color, 55) }} aria-hidden />
                <span className="text-muted-foreground">{fmtDay(items[0].utc, zone)}</span>
                <span className="normal-case" style={{ color }}>· {t(`rounds.${phase}`)}</span>
                {isToday && <span className="text-primary bg-primary/10 rounded px-1.5 py-0.5 text-[10px] tracking-normal normal-case">{t("calendar.today")}</span>}
              </h2>
              <div className="space-y-1.5">
                {items.map((m) => <MatchCard key={m.match} m={m} zone={zone} locale={locale} t={t} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ m, zone, locale, t }: { m: MatchInfo; zone: import("@/lib/format").Zone; locale: Locale; t: TFunction }) {
  const final = m.status === "final";
  const live = m.status === "live";
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeName = m.homeName ?? m.projHome?.[0]?.name ?? m.slotHome ?? t("common.tbd");
  const awayName = m.awayName ?? m.projAway?.[0]?.name ?? m.slotAway ?? t("common.tbd");
  const homeWin = final && (m.homeScore ?? 0) > (m.awayScore ?? 0);
  const awayWin = final && (m.awayScore ?? 0) > (m.homeScore ?? 0);
  return (
    <Link
      href={localeHref(locale, `/match/${m.match}`)}
      className="border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30 block rounded-lg border transition-colors"
    >
      <div className="text-muted-2 flex items-center justify-between gap-1 px-2 pt-1.5 text-[10px]">
        <span className="truncate font-mono" suppressHydrationWarning>
          {live ? (
            <span className="text-live font-semibold">{m.liveDetail ?? "LIVE"}</span>
          ) : final ? (
            <span className="text-win font-semibold">{t("home.ft")}</span>
          ) : (
            fmtTimeShort(m.utc, zone)
          )}
        </span>
        <span className="shrink-0 truncate">{m.group ? `${m.group} · ` : ""}M{m.match}</span>
      </div>
      <div className="px-2 pt-1 pb-1">
        <Side resolved={!!m.home} code={homeCode} name={homeName} score={final || live ? m.homeScore : undefined} win={homeWin} cands={m.projHome} knockout={m.round !== "GROUP"} />
        <div className="border-border/40 my-1 border-t" />
        <Side resolved={!!m.away} code={awayCode} name={awayName} score={final || live ? m.awayScore : undefined} win={awayWin} cands={m.projAway} knockout={m.round !== "GROUP"} />
      </div>
      <div className="text-muted-2 border-border/40 truncate border-t px-2 py-1 text-[10px]">{fifaVenue(m.venue)}</div>
    </Link>
  );
}

// One side of a card: a resolved/clinched team (single line + score) OR — for an unresolved knockout
// slot — the top-3 candidate teams ranked by probability, so the potential fillers stay visible with a
// clear hierarchy (#1 emphasized, the rest muted).
function Side({ resolved, code, name, score, win, cands, knockout }: { resolved: boolean; code: string | null; name: string; score?: number; win?: boolean; cands?: SlotCandidate[]; knockout?: boolean }) {
  // Clinched knockout participant: certain, so it gets the SAME prominence as the candidate lead (bold,
  // larger flag) — but no probability bar, which reads as "settled" next to the candidates' bars.
  if (resolved && knockout) {
    return (
      <div className="flex items-center gap-1.5 px-0.5 py-px">
        <Flag code={code} size={15} />
        <span className="text-foreground min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
        {score != null && <span className={`shrink-0 font-mono text-[12px] tabular-nums ${win ? "text-foreground font-bold" : "text-muted-foreground"}`}>{score}</span>}
      </div>
    );
  }
  if (!resolved && cands && cands.length > 1) {
    return (
      <div className="space-y-px">
        {cands.slice(0, 3).map((c, i) => {
          const lead = i === 0;
          const w = Math.max(3, Math.min(c.prob, 0.99) * 100); // bar scaled to likelihood
          return (
            <div key={c.code} className="relative flex items-center overflow-hidden rounded">
              <span className="absolute inset-y-0 left-0" style={{ width: `${w}%`, backgroundColor: mix("var(--foreground)", lead ? 13 : 5) }} aria-hidden />
              <span className="relative flex w-full items-center gap-1.5 px-0.5 py-px">
                <Flag code={c.code} size={lead ? 15 : 13} />
                <span className={`min-w-0 flex-1 truncate ${lead ? "text-foreground text-[13px] font-semibold" : i === 1 ? "text-muted-foreground text-[11px]" : "text-muted-2 text-[11px]"}`}>{c.name}</span>
                <span className={`shrink-0 font-mono tabular-nums ${lead ? "text-foreground/90 text-[12px] font-semibold" : "text-muted-2 text-[10px]"}`}>{pct(Math.min(c.prob, 0.99))}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return <TeamLine code={code} name={name} score={score} win={win} projected={!resolved} prob={!resolved ? cands?.[0]?.prob : undefined} />;
}

function TeamLine({ code, name, score, win, projected, prob }: { code: string | null; name: string; score?: number; win?: boolean; projected?: boolean; prob?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Flag code={code} size={14} />
      <span className={`min-w-0 flex-1 truncate text-xs ${win ? "font-semibold" : projected ? "text-foreground/70" : ""}`}>
        {name}
        {projected && prob != null && <span className="text-muted-2 ml-1 font-mono text-[9px]">{pct(Math.min(prob, 0.99))}</span>}
      </span>
      {score != null && <span className={`shrink-0 font-mono text-xs tabular-nums ${win ? "text-foreground font-bold" : "text-muted-foreground"}`}>{score}</span>}
    </div>
  );
}
