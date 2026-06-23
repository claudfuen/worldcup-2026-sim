import { Flag } from "@/components/flag";
import { TEAM_BY_CODE } from "@/lib/data/teams";
import type { ProvisionalGroup } from "@/lib/liveProjection";

// "If the live score holds" standings for one group. Deterministic (frozen current scoreline);
// the green/amber zones are provisional positions, a ✓ is mathematically guaranteed given the
// live result. The official table (completed matches only) is rendered elsewhere and untouched.
export function ProvisionalStandings({ proj, bare }: { proj: ProvisionalGroup; bare?: boolean }) {
  return (
    <div className={bare ? "overflow-hidden" : "border-border bg-card overflow-hidden rounded-2xl border"}>
      <div className="border-border/60 space-y-1 border-b px-4 py-2.5">
        {proj.live.map((l) => (
          <div key={l.home + l.away} className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-red-400">
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" />LIVE
            </span>
            <Flag code={l.home} size={14} />
            <span className="font-medium">{TEAM_BY_CODE[l.home]?.name ?? l.home}</span>
            <span className="font-mono font-bold tabular-nums">{l.homeGoals}&ndash;{l.awayGoals}</span>
            <span className="font-medium">{TEAM_BY_CODE[l.away]?.name ?? l.away}</span>
            <Flag code={l.away} size={14} />
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-[10px] tracking-wide">
            <th className="py-1.5 pr-1 pl-3 text-left font-medium">Team</th>
            <th className="w-6 px-1 text-center font-medium" title="Played">P</th>
            <th className="w-7 px-1 text-center font-medium" title="Goal difference">GD</th>
            <th className="w-7 px-1 text-center font-semibold" title="Points">Pts</th>
            <th className="px-2 pr-3 text-right font-medium">If it ends now</th>
          </tr>
        </thead>
        <tbody>
          {proj.rows.map((r, i) => {
            const pos = i + 1;
            const cl = proj.clinch[r.code];
            const isLive = proj.live.some((l) => l.home === r.code || l.away === r.code);
            const out = cl.eliminatedTop2 && cl.eliminatedTop3;
            const zone = pos <= 2 ? "border-l-emerald-500" : pos === 3 ? "border-l-amber-500" : "border-l-transparent";
            return (
              <tr key={r.code} className={`border-l-2 ${zone} ${out ? "opacity-45" : ""} ${isLive ? "bg-red-500/[0.06]" : ""}`}>
                <td className="py-2 pr-1 pl-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-3 text-center font-mono text-[11px]">{pos}</span>
                    <Flag code={r.code} size={18} />
                    <span className={`truncate text-[13px] font-medium ${out ? "line-through" : ""}`}>{TEAM_BY_CODE[r.code]?.name ?? r.code}</span>
                  </div>
                </td>
                <td className="text-muted-foreground px-1 text-center font-mono text-xs tabular-nums">{r.played}</td>
                <td className="px-1 text-center font-mono text-xs tabular-nums">{r.gd >= 0 ? "+" : ""}{r.gd}</td>
                <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{r.pts}</td>
                <td className="px-2 pr-3 text-right text-xs">
                  {cl.winner ? (
                    <span className="text-emerald-400">✓ wins group</span>
                  ) : cl.top2 ? (
                    <span className="text-emerald-400">✓ through</span>
                  ) : out ? (
                    <span className="text-muted-foreground/60">out</span>
                  ) : pos <= 2 ? (
                    <span className="text-emerald-400">top 2</span>
                  ) : pos === 3 ? (
                    <span className="text-amber-400">3rd</span>
                  ) : (
                    <span className="text-muted-foreground">4th</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground/60 border-border/60 border-t px-4 py-2.5 text-[11px]">
        Provisional, if the live score holds. The official table only changes at full time. Top 2 advance; the 8 best
        third-placed teams also reach the Round of 32. A <span className="text-emerald-400">✓</span> is guaranteed even
        with this result locked in.
      </p>
    </div>
  );
}
