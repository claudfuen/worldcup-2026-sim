"use client";

import { useState } from "react";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { etTime, etDay, etDayKey, pct } from "@/lib/format";
import { MY_MATCH_NUMBERS } from "@/lib/data/tickets";

const ROUND_NAME: Record<string, string> = {
  GROUP: "Group", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3P": "Third place", FINAL: "Final",
};
const FILTERS = [
  { key: "all", label: "All" },
  { key: "GROUP", label: "Groups" },
  { key: "KO", label: "Knockout" },
  { key: "mine", label: "🎟️ Mine" },
];

export function ScheduleList({ matches }: { matches: MatchInfo[] }) {
  const [filter, setFilter] = useState("all");
  const tickets = new Set(MY_MATCH_NUMBERS);

  const shown = matches.filter((m) => {
    if (filter === "all") return true;
    if (filter === "GROUP") return m.round === "GROUP";
    if (filter === "KO") return m.round !== "GROUP";
    if (filter === "mine") return tickets.has(m.match);
    return true;
  });

  // group by ET day
  const days: { key: string; label: string; items: MatchInfo[] }[] = [];
  for (const m of [...shown].sort((a, b) => a.utc.localeCompare(b.utc))) {
    const key = etDayKey(m.utc);
    let d = days.find((x) => x.key === key);
    if (!d) { d = { key, label: etDay(m.utc), items: [] }; days.push(d); }
    d.items.push(m);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
              filter === f.key ? "bg-primary text-primary-foreground font-medium" : "bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="space-y-6">
        {days.map((d) => (
          <div key={d.key}>
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">{d.label}</h3>
            <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-xl border">
              {d.items.map((m) => <Row key={m.match} m={m} hasTicket={tickets.has(m.match)} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ m, hasTicket }: { m: MatchInfo; hasTicket: boolean }) {
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeLabel = m.homeName ?? (m.projHome?.[0] ? `${m.projHome[0].name}` : m.slotHome ?? "TBD");
  const awayLabel = m.awayName ?? (m.projAway?.[0] ? `${m.projAway[0].name}` : m.slotAway ?? "TBD");
  const final = m.status === "final";
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <div className="text-muted-foreground w-14 shrink-0 text-xs">
        <div className="font-mono">{etTime(m.utc)}</div>
        <div className="text-[10px]">{ROUND_NAME[m.round]}{m.group ? ` ${m.group}` : ""}</div>
      </div>
      <div className="min-w-0 flex-1">
        <TeamRow code={homeCode} label={homeLabel} score={final ? m.homeScore : undefined} win={final && (m.homeScore ?? 0) > (m.awayScore ?? 0)} projected={!m.home} prob={!m.home ? m.projHome?.[0]?.prob : undefined} />
        <TeamRow code={awayCode} label={awayLabel} score={final ? m.awayScore : undefined} win={final && (m.awayScore ?? 0) > (m.homeScore ?? 0)} projected={!m.away} prob={!m.away ? m.projAway?.[0]?.prob : undefined} />
      </div>
      <div className="hidden w-36 shrink-0 text-right sm:block">
        {hasTicket && <span className="mr-1" title="You have tickets">🎟️</span>}
        {final ? (
          <span className="text-[11px] font-medium text-emerald-400">FT</span>
        ) : m.favorite ? (
          <span className="text-muted-foreground text-[11px]">
            <span className="text-foreground/80">{m.favorite.name}</span> {pct(m.favorite.winProb)}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-[11px]">projected</span>
        )}
        <div className="text-muted-foreground/60 truncate text-[10px]">{m.venue}</div>
      </div>
    </div>
  );
}

function TeamRow({ code, label, score, win, projected, prob }: { code: string | null; label: string; score?: number; win?: boolean; projected?: boolean; prob?: number }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Flag code={code} size={18} />
      <span className={`min-w-0 flex-1 truncate text-sm ${win ? "font-semibold" : projected ? "text-foreground/75" : ""}`}>
        {label}
        {projected && prob != null && <span className="text-muted-foreground/60 ml-1 font-mono text-[10px]">{pct(Math.min(prob, 0.99))}</span>}
      </span>
      {score != null && <span className={`shrink-0 font-mono text-sm tabular-nums ${win ? "font-bold" : "text-muted-foreground"}`}>{score}</span>}
    </div>
  );
}
