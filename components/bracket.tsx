import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { pct, etDay } from "@/lib/format";
import { MY_MATCH_NUMBERS } from "@/lib/data/tickets";

// Column orderings chosen so each match's two feeders are vertically adjacent (top half, then bottom half).
const ORDER: Record<string, number[]> = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF: [97, 98, 99, 100],
  SF: [101, 102],
  FINAL: [104],
};
const ROUND_LABEL: Record<string, string> = { R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", FINAL: "Final" };

export function Bracket({ matches, highlightCode }: { matches: MatchInfo[]; highlightCode?: string }) {
  const byMatch = new Map(matches.map((m) => [m.match, m]));
  const tickets = new Set(MY_MATCH_NUMBERS);
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-[1100px] gap-3">
        {(["R32", "R16", "QF", "SF", "FINAL"] as const).map((round) => (
          <div key={round} className="flex flex-1 flex-col">
            <div className="text-muted-foreground mb-2 px-1 text-[10px] font-semibold tracking-wider uppercase">
              {ROUND_LABEL[round]}
            </div>
            <div className="flex flex-1 flex-col justify-around gap-2">
              {ORDER[round].map((mn) => {
                const m = byMatch.get(mn);
                if (!m) return null;
                return <Node key={mn} m={m} hasTicket={tickets.has(mn)} highlightCode={highlightCode} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ m, hasTicket, highlightCode }: { m: MatchInfo; hasTicket: boolean; highlightCode?: string }) {
  const hi =
    highlightCode &&
    [m.home, m.away, m.projHome?.[0]?.code, m.projAway?.[0]?.code].includes(highlightCode);
  return (
    <div
      className={`bg-card rounded-lg border text-xs ${
        hi ? "border-primary/60 ring-primary/20 ring-1" : hasTicket ? "border-amber-500/50" : "border-border"
      }`}
    >
      <div className="text-muted-foreground flex items-center justify-between px-2 pt-1 text-[9px]">
        <span>M{m.match} · {etDay(m.utc)}</span>
        {hasTicket && <span title="You have tickets">🎟️</span>}
      </div>
      <Side m={m} side="home" highlightCode={highlightCode} />
      <div className="border-border/40 border-t" />
      <Side m={m} side="away" highlightCode={highlightCode} />
    </div>
  );
}

function Side({ m, side, highlightCode }: { m: MatchInfo; side: "home" | "away"; highlightCode?: string }) {
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const proj = (side === "home" ? m.projHome : m.projAway)?.[0];
  const code = resolved ?? proj?.code ?? null;
  const label = name ?? proj?.name ?? "TBD";
  const prob = resolved ? null : proj?.prob;
  const isHi = highlightCode && code === highlightCode;
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1.5 ${isHi ? "bg-primary/10" : ""}`}>
      <Flag code={code} size={18} />
      <span className={`min-w-0 flex-1 truncate ${resolved ? "font-medium" : "text-foreground/80"}`}>{label}</span>
      {prob != null && <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">{pct(prob)}</span>}
    </div>
  );
}
