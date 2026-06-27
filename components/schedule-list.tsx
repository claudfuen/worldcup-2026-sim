"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { HotBadge } from "./hot-badge";
import { fmtTimeShort, fmtDay, fmtDayKey, pct } from "@/lib/format";
import { useViewerZone } from "@/lib/useViewerZone";

const ROUND_NAME: Record<string, string> = {
  GROUP: "Group", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3P": "Third place", FINAL: "Final",
};
const FILTERS = [
  { key: "all", label: "All" },
  { key: "GROUP", label: "Groups" },
  { key: "KO", label: "Knockout" },
];
const TIME_FILTERS = [
  { key: "upcoming", label: "Recent & upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All dates" },
];

export function ScheduleList({ matches, hotReasons = {} }: { matches: MatchInfo[]; hotReasons?: Record<number, string> }) {
  const [filter, setFilter] = useState("all");
  const [time, setTime] = useState("upcoming");
  const { zone } = useViewerZone();
  // "today" depends on the wall clock + viewer zone, both of which differ server vs client. Resolve it
  // only after mount so SSR and first client render are identical (no midnight hydration mismatch); the
  // day filter is simply inactive until then.
  const [nowIso, setNowIso] = useState<string | null>(null);
  useEffect(() => setNowIso(new Date().toISOString()), []);
  const today = nowIso ? fmtDayKey(nowIso, zone) : null;
  // A one-day look-back so just-finished and yesterday's matches don't vanish the moment the day rolls over
  // (you can still see yesterday's scores when you check in the next morning).
  const yesterday = nowIso ? fmtDayKey(new Date(Date.parse(nowIso) - 86400000).toISOString(), zone) : null;

  const shown = matches.filter((m) => {
    if (filter === "GROUP" && m.round !== "GROUP") return false;
    if (filter === "KO" && m.round === "GROUP") return false;
    if (today != null) {
      const day = fmtDayKey(m.utc, zone);
      if (time === "upcoming" && yesterday != null && day < yesterday) return false;
      if (time === "past" && day >= today) return false;
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
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
        <Segmented options={TIME_FILTERS} value={time} onChange={setTime} />
      </div>
      {days.length === 0 && <p className="text-muted-foreground text-sm">No matches for this filter.</p>}
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
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeLabel = m.homeName ?? (m.projHome?.[0] ? `${m.projHome[0].name}` : m.slotHome ?? "TBD");
  const awayLabel = m.awayName ?? (m.projAway?.[0] ? `${m.projAway[0].name}` : m.slotAway ?? "TBD");
  const final = m.status === "final";
  const live = m.status === "live";
  const showScore = final || live;
  return (
    <Link href={`/match/${m.match}`} className="hover:bg-muted/30 flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4">
      <div className="text-muted-foreground w-16 shrink-0 text-xs">
        <div className="font-mono whitespace-nowrap" suppressHydrationWarning>{fmtTimeShort(m.utc, zone)}</div>
        <div className="text-[10px]">{ROUND_NAME[m.round]}{m.group ? ` ${m.group}` : ""}</div>
      </div>
      <div className="min-w-0 flex-1 sm:flex-none sm:w-64">
        <TeamRow code={homeCode} label={homeLabel} score={showScore ? m.homeScore : undefined} win={final && (m.homeScore ?? 0) > (m.awayScore ?? 0)} projected={!m.home} prob={!m.home ? m.projHome?.[0]?.prob : undefined} />
        <TeamRow code={awayCode} label={awayLabel} score={showScore ? m.awayScore : undefined} win={final && (m.awayScore ?? 0) > (m.homeScore ?? 0)} projected={!m.away} prob={!m.away ? m.projAway?.[0]?.prob : undefined} />
      </div>
      {hotReason != null && <HotBadge reason={hotReason} className="ml-auto shrink-0" />}
      <div className="hidden w-44 shrink-0 sm:ml-auto sm:block">
        {live ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-live">
            <span className="size-1.5 animate-pulse rounded-full bg-live" />LIVE {m.liveDetail}
          </span>
        ) : final ? (
          <span className="text-[11px] font-medium text-win">FT</span>
        ) : m.favorite ? (
          <span className="text-muted-foreground text-[11px]">
            <span className="text-foreground/80">{m.favorite.name}</span> {pct(m.favorite.winProb)}
          </span>
        ) : (
          <span className="text-muted-2 text-[11px]">projected</span>
        )}
        <div className="text-muted-2 truncate text-[10px]">{m.venue}</div>
      </div>
    </Link>
  );
}

function TeamRow({ code, label, score, win, projected, prob }: { code: string | null; label: string; score?: number; win?: boolean; projected?: boolean; prob?: number }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Flag code={code} size={18} />
      <span className={`min-w-0 flex-1 truncate text-sm ${win ? "font-semibold" : projected ? "text-foreground/75" : ""}`}>
        {label}
        {projected && prob != null && <span className="text-muted-2 ml-1 font-mono text-[10px]">{pct(Math.min(prob, 0.99))}</span>}
      </span>
      {score != null && <span className={`shrink-0 font-mono text-sm tabular-nums ${win ? "font-bold" : "text-muted-foreground"}`}>{score}</span>}
    </div>
  );
}

// A compact segmented control (a single track with a raised active segment) — reads more intentional than
// a row of separate pills.
function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="border-border bg-muted/30 inline-flex shrink-0 rounded-lg border p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`rounded-[0.3rem] px-3 py-1 text-sm whitespace-nowrap ${
            value === o.key ? "bg-surface-raised text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
