import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import { Flag } from "@/components/flag";
import { Delta } from "@/components/delta";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { TodaySection } from "@/components/today-section";
import { forecastPct } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const matches = overlayLive(data.matches, live);
  const contenders = data.teams.slice(0, 8);
  const maxTitle = contenders[0]?.title || 1;
  const hasLive = matches.some((m) => m.status === "live");

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <LiveAutoRefresh enabled={hasLive} />
      <header className="mb-8">
        <div className="text-primary font-mono text-[11px] font-medium tracking-wide uppercase">Live forecast</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">World Cup 2026 Predictions</h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          {data.iterations.toLocaleString()} Monte Carlo simulations · {data.matchesPlayed}/{data.totalGroupMatches} group
          matches played · live from real results.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Title contenders */}
        <section className="lg:col-span-2">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wide uppercase">Title odds</h2>
          <div className="border-border bg-card rounded-2xl border p-2">
            {contenders.map((t, i) => (
              <Link key={t.code} href="/bracket" className="hover:bg-muted/40 flex items-center gap-3 rounded-xl px-3 py-2.5">
                <span className="text-muted-foreground w-4 text-right font-mono text-xs">{i + 1}</span>
                <Flag code={t.code} size={26} />
                <span className="w-32 shrink-0 font-medium">{t.name}</span>
                <div className="bg-muted/40 relative h-2 flex-1 overflow-hidden rounded-full">
                  <div className="bg-primary absolute inset-y-0 left-0 rounded-full" style={{ width: `${(t.title / maxTitle) * 100}%` }} />
                </div>
                <span className="flex w-16 shrink-0 items-center justify-end font-mono text-sm font-semibold tabular-nums">
                  {forecastPct(t.title)}<Delta v={t.titleDelta} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Side column */}
        <section className="space-y-4">
          <NavCard href="/groups" title="Groups" desc="Standings, qualification odds & cut-offs" />
          <NavCard href="/bracket" title="Bracket" desc="Projected knockout tree to the final" />
          <NavCard href="/schedule" title="Schedule" desc="All 104 matches, your local time" />
          <NavCard href="/methodology" title="Method" desc="How the model works" />
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-muted-foreground mb-1 font-mono text-xs font-medium tracking-wide uppercase">Chance of reaching each round</h2>
        <p className="text-muted-foreground/70 mb-3 text-xs">How deep each contender is projected to go, across {data.iterations.toLocaleString()} simulations.</p>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border/60 border-b text-[11px]">
                <th className="py-2 pr-2 text-left font-medium">Team</th>
                <th className="hidden w-12 px-1 text-right font-medium sm:table-cell">R32</th>
                <th className="w-12 px-1 text-right font-medium">R16</th>
                <th className="hidden w-12 px-1 text-right font-medium sm:table-cell">QF</th>
                <th className="hidden w-12 px-1 text-right font-medium sm:table-cell">SF</th>
                <th className="w-12 px-1 text-right font-medium">Final</th>
                <th className="w-16 px-1 pr-2 text-right font-semibold">Champion</th>
              </tr>
            </thead>
            <tbody>
              {data.teams.slice(0, 12).map((t) => (
                <tr key={t.code} className="border-border/40 border-b last:border-0">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <Flag code={t.code} size={18} />
                      <span className="truncate font-medium">{t.name}</span>
                    </div>
                  </td>
                  <RoundCell v={t.advance} hideMobile />
                  <RoundCell v={t.r16} />
                  <RoundCell v={t.qf} hideMobile />
                  <RoundCell v={t.sf} hideMobile />
                  <RoundCell v={t.final} />
                  <td className="text-primary px-1 pr-2 text-right font-mono text-sm font-semibold tabular-nums">{forecastPct(t.title)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TodaySection matches={matches} />

      <footer className="border-border/60 text-muted-foreground/70 mt-12 border-t pt-6 text-xs text-pretty">
        Elo + Poisson scoreline model (backtested RPS ~0.18) with rating uncertainty, host advantage and an extra-time/penalty
        knockout model · 2026 head-to-head-first tiebreakers · verified 495-row third-place table. <Link href="/methodology" className="text-primary">How it works →</Link>
        <div className="mt-2">Live data via ESPN · not affiliated with FIFA.</div>
      </footer>
    </main>
  );
}

function RoundCell({ v, hideMobile }: { v: number; hideMobile?: boolean }) {
  return (
    <td className={`text-muted-foreground px-1 text-right font-mono text-xs tabular-nums ${hideMobile ? "hidden sm:table-cell" : ""}`}>
      {forecastPct(v)}
    </td>
  );
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="border-border bg-card hover:border-primary/50 block rounded-2xl border p-4">
      <div className="font-semibold">{title}</div>
      <div className="text-muted-foreground mt-0.5 text-xs">{desc}</div>
    </Link>
  );
}
