import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import { Flag } from "@/components/flag";
import { Delta } from "@/components/delta";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { TodaySection } from "@/components/today-section";
import { ShareBar } from "@/components/share-bar";
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
  // Teams that have mathematically clinched a Round-of-32 place: their R32 cell shows a ✓ (locked),
  // never a capped forecast %. Sourced from the group clinch status, not the sim frequency.
  const advanceClinched = new Set<string>();
  for (const g of data.groups) {
    for (const t of g.teams) {
      if (t.status === "won_group" || t.status === "second" || t.status === "advanced") advanceClinched.add(t.code);
    }
  }
  const [c1, c2, c3] = data.teams;
  // Biggest title-odds mover today (>= 1pp), for a fresh, shareable hook in the lede.
  const mover = [...data.teams]
    .filter((t) => t.titleDelta != null && Math.abs(t.titleDelta) >= 0.01)
    .sort((a, b) => Math.abs(b.titleDelta!) - Math.abs(a.titleDelta!))[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <header className="mb-8 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">Live forecast</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">World Cup 2026 Predictions</h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          {data.iterations.toLocaleString()} Monte Carlo simulations · {data.matchesPlayed}/{data.totalGroupMatches} group
          matches played · live from real results.
        </p>
        {c1 && (
          <>
            <h2 className="mt-5 text-lg font-semibold tracking-tight">Who will win the 2026 World Cup?</h2>
            <p className="text-muted-foreground mt-1.5 text-sm text-pretty">
              The model&apos;s favorite is <span className="text-foreground font-medium">{c1.name} ({forecastPct(c1.title)})</span>
              {c2 && <>, ahead of {c2.name} ({forecastPct(c2.title)})</>}
              {c3 && <> and {c3.name} ({forecastPct(c3.title)})</>}, across {data.iterations.toLocaleString()} simulations
              updated live from real results.
              {mover && (
                <>
                  {" "}Biggest move today: <span className="text-foreground font-medium">{mover.name}</span>{" "}
                  <span className={mover.titleDelta! > 0 ? "text-win" : "text-destructive"}>
                    {mover.titleDelta! > 0 ? "▲" : "▼"}{Math.abs(Math.round(mover.titleDelta! * 100))}
                  </span>{" "}
                  to {forecastPct(mover.title)}.
                </>
              )}
            </p>
            <div className="mt-4">
              <ShareBar text={`${c1.name} are the ${forecastPct(c1.title)} favorite to win the World Cup 2026, per 20,000 Monte Carlo sims.`} path="/" />
            </div>
          </>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Title contenders */}
        <section className="lg:col-span-2">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">Title odds</h2>
          <div className="border-border-strong bg-surface-raised rounded-2xl border p-2">
            {contenders.map((t, i) => (
              <Link key={t.code} href="/bracket" className="hover:bg-muted/30 flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors">
                <span className="text-muted-2 w-4 text-right font-mono text-xs tabular-nums">{i + 1}</span>
                <Flag code={t.code} size={26} />
                <span className="w-32 shrink-0 font-medium">{t.name}</span>
                <div className="bg-muted/40 relative h-2 flex-1 overflow-hidden rounded-full">
                  <div className="from-primary to-primary/70 absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out" style={{ width: `${(t.title / maxTitle) * 100}%` }} />
                </div>
                <span className="flex w-16 shrink-0 items-center justify-end font-mono text-sm font-semibold tabular-nums">
                  {forecastPct(t.title)}<Delta v={t.titleDelta} />
                </span>
              </Link>
            ))}
          </div>
          <p className="text-muted-2 mt-2 text-[11px]">
            <span className="text-win">▲</span>
            <span className="text-destructive">▼</span> change since the start of today
          </p>
        </section>

        {/* Side column - eyebrow mirrors "Title odds" so the card tops align across the two columns */}
        <section>
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">Explore</h2>
          <div className="space-y-4">
            <NavCard href="/groups" title="Groups" desc="Standings, qualification odds & cut-offs" />
            <NavCard href="/bracket" title="Bracket" desc="Projected knockout tree to the final" />
            <NavCard href="/schedule" title="Schedule" desc="All 104 matches, your local time" />
            <NavCard href="/methodology" title="Method" desc="How the model works" />
          </div>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-muted-foreground mb-1 font-mono text-xs font-semibold tracking-wide uppercase">Chance of reaching each round</h2>
        <p className="text-muted-2 mb-3 text-xs">How deep each contender is projected to go, across {data.iterations.toLocaleString()} simulations.</p>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-border/60 border-b text-[10px] tracking-wide">
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
                  <RoundCell v={t.advance} hideMobile clinched={advanceClinched.has(t.code)} />
                  <RoundCell v={t.r16} />
                  <RoundCell v={t.qf} hideMobile />
                  <RoundCell v={t.sf} hideMobile />
                  <RoundCell v={t.final} />
                  <td className="text-primary px-1 pr-2 text-right font-mono text-sm font-semibold tabular-nums" style={{ backgroundColor: heat(t.title) }}>{forecastPct(t.title)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <TodaySection matches={matches} />

      <footer className="border-border/60 text-muted-2 mt-12 border-t pt-6 text-xs text-pretty">
        Elo + Poisson scoreline model (backtested RPS ~0.18) with rating uncertainty, host advantage and an extra-time/penalty
        knockout model · 2026 head-to-head-first tiebreakers · verified 495-row third-place table. <Link href="/methodology" className="text-primary">How it works →</Link>
        <div className="mt-2">Live data via ESPN · not affiliated with FIFA.</div>
      </footer>
    </main>
  );
}

// Heatmap tint: a faint primary wash whose strength scales with the probability, so the funnel reads
// as signal (deep at R32, fading toward Champion) rather than a flat grid of grey numbers.
function heat(v: number): string {
  return `color-mix(in oklab, var(--primary) ${Math.round(Math.min(v, 1) * 22)}%, transparent)`;
}

function RoundCell({ v, hideMobile, clinched }: { v: number; hideMobile?: boolean; clinched?: boolean }) {
  return (
    <td
      className={`px-1 text-right font-mono text-xs tabular-nums ${clinched ? "text-win" : "text-muted-2"} ${hideMobile ? "hidden sm:table-cell" : ""}`}
      style={{ backgroundColor: clinched ? heat(1) : heat(v) }}
    >
      {clinched ? <span title="Clinched a Round-of-32 place">✓</span> : forecastPct(v)}
    </td>
  );
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="group border-border bg-card hover:border-primary/50 hover:bg-surface-raised block rounded-2xl border p-4 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <span className="text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden>→</span>
      </div>
      <div className="text-muted-foreground mt-0.5 text-xs">{desc}</div>
    </Link>
  );
}
