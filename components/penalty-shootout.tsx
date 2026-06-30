"use client";

import { Flag } from "@/components/flag";
import type { ShootoutKick } from "@/lib/matchEvents";
import { useT, type TFunction } from "@/lib/i18n/provider";

// Kick-by-kick penalty shootout: each taker as a green (scored) or red (missed) dot with their name, in
// order, per team — so the page shows HOW the shootout went, not just the aggregate tally. Two columns
// (home left, away right), winner tinted. Dots are data-viz (the standard shootout representation), not icons.
export function PenaltyShootout({ homeCode, awayCode, homeName, awayName, home, away, homePens, awayPens, winner }: {
  homeCode: string | null; awayCode: string | null; homeName: string; awayName: string;
  home: ShootoutKick[]; away: ShootoutKick[]; homePens?: number; awayPens?: number; winner?: string;
}) {
  const t = useT();
  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.shootoutHeading")}</h2>
      <div className="border-border bg-card rounded-2xl border p-4 sm:p-5 dark:inset-ring dark:inset-ring-white/5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:gap-x-10">
          <TeamColumn code={homeCode} name={homeName} kicks={home} tally={homePens} won={winner != null && winner === homeCode} t={t} />
          <TeamColumn code={awayCode} name={awayName} kicks={away} tally={awayPens} won={winner != null && winner === awayCode} align="right" t={t} />
        </div>
        <div className="border-border/50 text-muted-2 mt-4 flex items-center gap-4 border-t pt-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5"><Dot scored /> {t("match.penScored")}</span>
          <span className="inline-flex items-center gap-1.5"><Dot scored={false} /> {t("match.penMissed")}</span>
        </div>
      </div>
    </section>
  );
}

function TeamColumn({ code, name, kicks, tally, won, align, t }: {
  code: string | null; name: string; kicks: ShootoutKick[]; tally?: number; won: boolean; align?: "right"; t: TFunction;
}) {
  const right = align === "right";
  return (
    <div className={right ? "border-border/50 border-s ps-4 sm:ps-10" : ""}>
      <div className={`mb-3 flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
        <Flag code={code} size={20} />
        <span className={`min-w-0 flex-1 truncate font-semibold ${won ? "text-win" : ""}`}>{name}</span>
        {tally != null && <span className={`shrink-0 font-mono text-lg font-bold tabular-nums ${won ? "text-win" : "text-muted-foreground"}`}>{tally}</span>}
      </div>
      <ol className="space-y-2">
        {kicks.map((k) => (
          <li key={k.order} className={`flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
            <Dot scored={k.scored} />
            <span className={`min-w-0 truncate text-sm ${k.scored ? "" : "text-muted-foreground"}`} title={`${t(k.scored ? "match.penScored" : "match.penMissed")}`}>{k.player}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Dot({ scored }: { scored: boolean }) {
  return <span className={`inline-block size-2.5 shrink-0 rounded-full ${scored ? "bg-win" : "bg-destructive"}`} aria-hidden />;
}
