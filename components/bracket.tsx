"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { teamSlug } from "@/lib/slug";
import { pct, fmtDay } from "@/lib/format";
import { useViewerZone } from "@/lib/useViewerZone";

// Column orderings chosen so each match's two feeders are vertically adjacent (top half, then bottom half).
const ORDER: Record<string, number[]> = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF: [97, 98, 99, 100],
  SF: [101, 102],
  FINAL: [104],
};
const ROUNDS = ["R32", "R16", "QF", "SF", "FINAL"] as const;
const ROUND_LABEL: Record<string, string> = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", FINAL: "Final" };
const ROUND_SHORT: Record<string, string> = { R32: "R32", R16: "R16", QF: "QF", SF: "SF", FINAL: "Final" };

export function Bracket({
  matches,
  myMatchNumbers = [],
  champion,
}: {
  matches: MatchInfo[];
  myMatchNumbers?: number[];
  champion?: { code: string; name: string; prob: number };
}) {
  const byMatch = new Map(matches.map((m) => [m.match, m]));
  const tickets = new Set(myMatchNumbers);
  const [highlight, setHighlight] = useState("");

  // Every team that appears anywhere in the knockout projections, for the "trace a team" picker.
  const teamMap = new Map<string, string>();
  for (const m of matches) {
    if (m.home && m.homeName) teamMap.set(m.home, m.homeName);
    if (m.away && m.awayName) teamMap.set(m.away, m.awayName);
    for (const c of m.projHome ?? []) teamMap.set(c.code, c.name);
    for (const c of m.projAway ?? []) teamMap.set(c.code, c.name);
  }
  const teamOpts = [...teamMap.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  const hl = highlight || undefined;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span id="trace-team-label" className="text-muted-foreground font-mono text-[10px] font-semibold tracking-wide uppercase">Trace a team</span>
        <select
          aria-labelledby="trace-team-label"
          value={highlight}
          onChange={(e) => setHighlight(e.target.value)}
          className="border-border-strong bg-surface-raised hover:border-primary/40 focus-visible:border-primary/60 focus-visible:ring-primary/50 rounded-lg border px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
        >
          <option value="">Pick a team to light up its path</option>
          {teamOpts.map((t) => (
            <option key={t.code} value={t.code}>{t.name}</option>
          ))}
        </select>
        {highlight && (
          <button onClick={() => setHighlight("")} className="text-muted-foreground hover:text-foreground text-xs">
            Clear
          </button>
        )}
      </div>

      {/* Mobile: a full tree doesn't fit a phone, so show one round at a time as a readable list. */}
      <MobileRounds byMatch={byMatch} tickets={tickets} highlightCode={hl} champion={champion} />

      {/* Desktop: the full connected tree. */}
      <div className="hidden overflow-x-auto pb-4 md:block">
        <div className="flex min-w-[1140px] items-stretch">
          {ROUNDS.map((round, ri) => (
            <Fragment key={round}>
              <div className="flex min-w-[176px] flex-1 flex-col">
                <div className="text-muted-foreground mb-3 h-4 px-1 text-[10px] font-semibold font-mono tracking-wide uppercase">
                  {ROUND_LABEL[round]}
                </div>
                {round === "FINAL" && champion && <ChampionCard champion={champion} />}
                <div className="flex flex-1 flex-col gap-y-2.5">
                  {ORDER[round].map((mn) => {
                    const m = byMatch.get(mn);
                    return (
                      <div key={mn} className="flex flex-1 items-center">
                        {m && <Node m={m} hasTicket={tickets.has(mn)} highlightCode={hl} final={round === "FINAL"} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              {ri < ROUNDS.length - 1 && <Connectors count={ORDER[ROUNDS[ri + 1]].length} />}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

function MobileRounds({
  byMatch,
  tickets,
  highlightCode,
  champion,
}: {
  byMatch: Map<number, MatchInfo>;
  tickets: Set<number>;
  highlightCode?: string;
  champion?: { code: string; name: string; prob: number };
}) {
  const [round, setRound] = useState<(typeof ROUNDS)[number]>("R32");
  return (
    <div className="md:hidden">
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {ROUNDS.map((r) => (
          <button
            key={r}
            onClick={() => setRound(r)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
              round === r ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"
            }`}
          >
            {ROUND_SHORT[r]}
          </button>
        ))}
      </div>
      <div className="text-muted-foreground mb-2.5 px-0.5 text-[10px] font-semibold font-mono tracking-wide uppercase">
        {ROUND_LABEL[round]}
      </div>
      <div className="space-y-2.5">
        {round === "FINAL" && champion && <ChampionCard champion={champion} />}
        {ORDER[round].map((mn) => {
          const m = byMatch.get(mn);
          return m ? <Node key={mn} m={m} hasTicket={tickets.has(mn)} highlightCode={highlightCode} big final={round === "FINAL"} /> : null;
        })}
      </div>
    </div>
  );
}

// The climax of the FINAL column: the model's projected champion, so the right edge of the bracket
// resolves to a clear terminus instead of an empty column under the "Final" header.
function ChampionCard({ champion }: { champion: { code: string; name: string; prob: number } }) {
  return (
    <div className="border-primary/40 bg-primary/[0.07] mb-3 rounded-xl border p-3 text-center">
      <div className="text-primary mb-1.5 font-mono text-[10px] font-semibold tracking-wide uppercase">🏆 Projected champion</div>
      <Link href={`/team/${teamSlug(champion.name)}`} className="flex items-center justify-center gap-2 hover:underline">
        <Flag code={champion.code} size={22} />
        <span className="font-semibold">{champion.name}</span>
      </Link>
      <div className="text-primary mt-1 font-mono text-sm font-bold tabular-nums">{pct(Math.min(champion.prob, 0.99))}</div>
    </div>
  );
}

// A column of "⊐" brackets, one per next-round match. With uniform node heights, each
// bracket's top/bottom edges land exactly on its two feeders' centers and its right edge
// meets the target node — turning the columns into a connected tree.
function Connectors({ count }: { count: number }) {
  return (
    <div className="flex w-4 shrink-0 flex-col">
      <div className="mb-3 h-4" />
      {/* gap-y matches the node columns so each ⊐ bracket stays centered on its two feeders' midpoint. */}
      <div className="flex flex-1 flex-col gap-y-2.5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div className="border-muted-foreground/30 h-1/2 w-full rounded-r-md border-t border-r border-b" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ m, hasTicket, highlightCode, big, final }: { m: MatchInfo; hasTicket: boolean; highlightCode?: string; big?: boolean; final?: boolean }) {
  const { zone } = useViewerZone();
  const hi =
    !!highlightCode &&
    (m.home === highlightCode ||
      m.away === highlightCode ||
      !!m.projHome?.some((c) => c.code === highlightCode) ||
      !!m.projAway?.some((c) => c.code === highlightCode));
  return (
    <Link
      href={`/match/${m.match}`}
      className={`bg-card hover:bg-muted/30 block w-full rounded-xl border transition-colors ${big ? "text-sm" : "text-xs"} ${
        hi
          ? "border-primary/60 ring-primary/20 ring-1"
          : final
            ? "border-primary/45 ring-primary/15 bg-primary/[0.04] ring-1"
            : hasTicket
              ? "border-contention/50"
              : "border-border"
      }`}
    >
      <div className={`flex items-center justify-between gap-1 ${final ? "text-primary/90" : "text-muted-foreground"} ${big ? "px-2.5 pt-2 pb-1 text-[10px]" : "px-2 pt-1.5 pb-1 text-[9px]"}`}>
        <span className="truncate" suppressHydrationWarning>{final ? "🏆 Final" : `M${m.match}`} · {fmtDay(m.utc, zone)} · {m.city}</span>
        {hasTicket && <span title="You have tickets" className="shrink-0">🎟️</span>}
      </div>
      <Side m={m} side="home" highlightCode={highlightCode} big={big} />
      <div className="border-border border-t" />
      <Side m={m} side="away" highlightCode={highlightCode} big={big} />
    </Link>
  );
}

function Side({ m, side, highlightCode, big }: { m: MatchInfo; side: "home" | "away"; highlightCode?: string; big?: boolean }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const proj = (side === "home" ? m.projHome : m.projAway)?.[0];

  // Third-place slots: a best-third can come from any of several groups (FIFA Annex C). We show the Monte
  // Carlo's most-likely qualifier with its fill probability, tagged "3rd" so the slot's nature stays clear.
  // The slot resolves to a bold, confirmed team (the `resolved` path below) once the group stage ends.
  if (!resolved && slot?.startsWith("3:")) {
    const groups = slot.slice(2).split(",").join("/");
    const isHi = highlightCode && proj?.code === highlightCode;
    return (
      <div className={`flex items-center ${big ? "gap-2.5 px-3 py-2.5" : "gap-1.5 px-2 py-1.5"} ${isHi ? "bg-primary/10" : ""}`}>
        {proj ? <Flag code={proj.code} size={big ? 22 : 18} /> : <span className={`bg-muted/30 shrink-0 rounded-[3px] ${big ? "size-[22px]" : "size-[18px]"}`} aria-hidden />}
        <span className="text-foreground/80 min-w-0 flex-1 truncate">
          <span className="text-muted-2 mr-1 font-mono text-[9px] font-semibold tracking-wide uppercase" title={`Third-placed team from group ${groups}`}>3rd</span>
          {proj?.name ?? groups}
        </span>
        {proj?.prob != null && <span className={`text-muted-foreground shrink-0 font-mono tabular-nums ${big ? "text-xs" : "text-[10px]"}`}>{pct(Math.min(proj.prob, 0.99))}</span>}
      </div>
    );
  }

  const code = resolved ?? proj?.code ?? null;
  const label = name ?? proj?.name ?? "TBD";
  const prob = resolved ? null : proj?.prob;
  const isHi = highlightCode && code === highlightCode;
  return (
    <div className={`flex items-center ${big ? "gap-2.5 px-3 py-2.5" : "gap-1.5 px-2 py-1.5"} ${isHi ? "bg-primary/10" : ""}`}>
      <Flag code={code} size={big ? 22 : 18} />
      <span className={`min-w-0 flex-1 truncate ${resolved ? "font-semibold" : "text-foreground/80"}`}>{label}</span>
      {resolved ? (
        <span className={`shrink-0 font-bold text-win ${big ? "text-xs" : "text-[10px]"}`} title="Confirmed">✓</span>
      ) : (
        prob != null && <span className={`text-muted-foreground shrink-0 font-mono tabular-nums ${big ? "text-xs" : "text-[10px]"}`}>{pct(Math.min(prob, 0.99))}</span>
      )}
    </div>
  );
}
