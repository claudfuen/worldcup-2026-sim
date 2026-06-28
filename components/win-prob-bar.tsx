"use client";
import { forecastPct } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

// A single 100%-wide stacked bar (home | draw | away) - no empty track. Home reads as the model/forecast
// voice (primary), away as the cool data pole, draw as neutral. Used for match win probability. Client so it
// can live inside the polled match islands — the width transitions animate as SWR pushes fresh probabilities.
export function WinProbBar({
  home,
  draw,
  away,
  homeName,
  awayName,
  secondary,
}: {
  home: number;
  draw: number;
  away: number;
  homeName: string;
  awayName: string;
  secondary?: boolean; // a muted reference bar (e.g. pre-match next to the live "now") — no names, same columns
}) {
  const t = useT();
  // Secondary: a de-emphasized bar whose percentages sit in the SAME three columns (home-left, draw-center,
  // away-right) as the primary bar above it, so the numbers line up vertically and the move reads at a glance.
  if (secondary) {
    return (
      <div>
        <div className="bg-muted/40 flex h-1.5 w-full overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
          <div className="bg-primary/55" style={{ width: `${home * 100}%` }} />
          <div className="bg-muted-foreground/30" style={{ width: `${draw * 100}%` }} />
          <div className="bg-data-cool/45" style={{ width: `${away * 100}%` }} />
        </div>
        <div className="text-muted-foreground mt-1.5 grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
          <span className="text-left">{forecastPct(home)}</span>
          <span className="text-center">{forecastPct(draw)}</span>
          <span className="text-right">{forecastPct(away)}</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="bg-muted/40 flex h-2.5 w-full overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
        <div className="bg-primary transition-[width] duration-700 ease-out" style={{ width: `${home * 100}%` }} />
        <div className="bg-muted-foreground/35 transition-[width] duration-700 ease-out" style={{ width: `${draw * 100}%` }} />
        <div className="bg-data-cool transition-[width] duration-700 ease-out" style={{ width: `${away * 100}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Legend dot="bg-primary" name={homeName} value={home} align="text-left" />
        <Legend dot="bg-muted-foreground/35" name={t("groups.draw")} value={draw} align="text-center" />
        <Legend dot="bg-data-cool" name={awayName} value={away} align="text-right" />
      </div>
    </div>
  );
}

function Legend({ dot, name, value, align }: { dot: string; name: string; value: number; align: string }) {
  const isRight = align === "text-right";
  const isCenter = align === "text-center";
  return (
    <div className={`min-w-0 ${align}`}>
      <div className={`flex items-center gap-1.5 ${isRight ? "justify-end" : isCenter ? "justify-center" : ""}`}>
        {!isRight && <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />}
        <span className="text-muted-foreground truncate text-xs">{name}</span>
        {isRight && <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />}
      </div>
      {/* forecastPct (not pct): a win probability is never definitive — cap at 99%, never round to 100%,
          and show "<1%" for a marginal chance rather than 0% (a live match can always still swing). */}
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">{forecastPct(value)}</div>
    </div>
  );
}
