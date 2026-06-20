import type { PredictionsPayload } from "@/lib/predictions";
import { Pct, fmtPct } from "./bar";
import { OpponentExplorer } from "./opponent-explorer";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-border bg-card rounded-xl border p-5 ${className}`}>{children}</div>;
}

export function Dashboard({ data }: { data: PredictionsPayload }) {
  const updated = new Date(data.updatedAt);
  const contenders = data.teams.slice(0, 10);
  const teamOpts = [...data.teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ code: t.code, name: t.name }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">World Cup 2026 Oracle</h1>
          <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 text-xs font-medium">Monte Carlo</span>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          {data.iterations.toLocaleString()} simulations · {data.matchesPlayed}/{data.totalGroupMatches} group matches played ·
          updated {updated.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
        <p className="text-muted-foreground/70 mt-1 text-xs">
          Elo + Poisson scoreline model (backtested RPS ~0.18), 2026 head-to-head-first tiebreakers, verified 495-row third-place table.
        </p>
      </header>

      {/* Title contenders */}
      <section className="mb-8">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Title contenders</h2>
        <Card>
          <div className="space-y-3">
            {contenders.map((t, i) => (
              <div key={t.code} className="flex items-center gap-3">
                <span className="text-muted-foreground w-5 text-right font-mono text-xs">{i + 1}</span>
                <span className="w-36 shrink-0 truncate font-medium">{t.name}</span>
                <span className="text-muted-foreground hidden w-14 shrink-0 font-mono text-xs sm:inline">{t.rating}</span>
                <div className="flex-1">
                  <Pct value={t.title} tone="green" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* R32 opponent explorer (answers: who would X face?) */}
      <section className="mb-8">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Knockout draw explorer</h2>
        <Card>
          <OpponentExplorer teams={teamOpts} r32Opponents={data.r32Opponents} defaultCode="BRA" />
        </Card>
      </section>

      {/* Groups */}
      <section className="mb-8">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Groups — win &amp; advance probability</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.groups.map((g) => (
            <Card key={g.group} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Group {g.group}</h3>
                <span className="text-muted-foreground text-[10px] tracking-wider uppercase">Win · Adv</span>
              </div>
              <div className="space-y-2.5">
                {g.teams.map((t) => (
                  <div key={t.code}>
                    <div className="mb-0.5 flex items-baseline justify-between">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <span className="text-muted-foreground ml-2 shrink-0 font-mono text-[11px] tabular-nums">
                        {t.pts}p {t.gd >= 0 ? "+" : ""}{t.gd}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground/80 w-9 shrink-0 text-right font-mono text-[11px]">{fmtPct(t.winGroup)}</span>
                      <div className="flex-1">
                        <Pct value={t.advance} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Full knockout probabilities */}
      <section className="mb-10">
        <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Knockout-round probabilities</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-[11px] tracking-wider uppercase">
                <th className="px-4 py-3 text-left font-medium">Team</th>
                <th className="px-2 py-3 text-right font-medium">Grp</th>
                <th className="px-2 py-3 text-right font-medium">Win Grp</th>
                <th className="px-2 py-3 text-right font-medium">Advance</th>
                <th className="px-2 py-3 text-right font-medium">R16</th>
                <th className="px-2 py-3 text-right font-medium">QF</th>
                <th className="px-2 py-3 text-right font-medium">SF</th>
                <th className="px-2 py-3 text-right font-medium">Final</th>
                <th className="px-4 py-3 text-right font-medium">Title</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.map((t) => (
                <tr key={t.code} className="border-border/50 hover:bg-muted/30 border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="text-muted-foreground px-2 py-2 text-right font-mono text-xs">{t.group}</td>
                  <Num v={t.winGroup} />
                  <Num v={t.advance} />
                  <Num v={t.r16} />
                  <Num v={t.qf} />
                  <Num v={t.sf} />
                  <Num v={t.final} />
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold tabular-nums">{fmtPct(t.title)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <footer className="text-muted-foreground/60 border-border border-t pt-6 text-xs">
        Data: ESPN public feed · ratings seeded from 49k internationals (1872-present) · not affiliated with FIFA.
      </footer>
    </main>
  );
}

function Num({ v }: { v: number }) {
  return (
    <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
      <span className={v >= 0.005 ? "text-foreground/80" : "text-muted-foreground/40"}>{fmtPct(v)}</span>
    </td>
  );
}
