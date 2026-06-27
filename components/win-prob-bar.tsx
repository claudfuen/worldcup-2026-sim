import { pct } from "@/lib/format";

// A single 100%-wide stacked bar (home | draw | away) - no empty track. Home reads as the model/forecast
// voice (primary), away as the cool data pole, draw as neutral. Used for match win probability.
export function WinProbBar({
  home,
  draw,
  away,
  homeName,
  awayName,
}: {
  home: number;
  draw: number;
  away: number;
  homeName: string;
  awayName: string;
}) {
  return (
    <div>
      <div className="bg-muted/40 flex h-2.5 w-full overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5">
        <div className="bg-primary transition-[width] duration-700 ease-out" style={{ width: `${home * 100}%` }} />
        <div className="bg-muted-foreground/35 transition-[width] duration-700 ease-out" style={{ width: `${draw * 100}%` }} />
        <div className="bg-data-cool transition-[width] duration-700 ease-out" style={{ width: `${away * 100}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Legend dot="bg-primary" name={homeName} value={home} align="text-left" />
        <Legend dot="bg-muted-foreground/35" name="Draw" value={draw} align="text-center" />
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
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">{pct(value)}</div>
    </div>
  );
}
