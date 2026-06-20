import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { Flag } from "@/components/flag";
import { etDateTime, pct } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const data = await getPredictions();
  const updated = new Date(data.updatedAt);
  const contenders = data.teams.slice(0, 8);
  const maxTitle = contenders[0]?.title || 1;
  const nextMine = [...data.myMatches]
    .filter((m) => new Date(m.utc).getTime() > Date.now())
    .sort((a, b) => a.utc.localeCompare(b.utc))[0];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">World Cup 2026 Oracle</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {data.iterations.toLocaleString()} Monte Carlo simulations · {data.matchesPlayed}/{data.totalGroupMatches} group
          matches played · updated {updated.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Title contenders */}
        <section className="lg:col-span-2">
          <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">Title odds</h2>
          <div className="border-border bg-card rounded-2xl border p-2">
            {contenders.map((t, i) => (
              <Link
                key={t.code}
                href="/bracket"
                className="hover:bg-muted/40 flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
              >
                <span className="text-muted-foreground w-4 text-right font-mono text-xs">{i + 1}</span>
                <Flag code={t.code} size={26} />
                <span className="w-32 shrink-0 font-medium">{t.name}</span>
                <div className="bg-muted/40 relative h-2 flex-1 overflow-hidden rounded-full">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${(t.title / maxTitle) * 100}%` }} />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">{pct(t.title)}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Side column */}
        <section className="space-y-4">
          {nextMine && (
            <div className="border-amber-500/40 bg-amber-500/5 rounded-2xl border p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-400">🎟️ YOUR NEXT MATCH</div>
              <div className="text-sm font-semibold">
                {nextMine.homeName ?? nextMine.projHome?.[0]?.name ?? nextMine.slotHome}
                <span className="text-muted-foreground mx-1 font-normal">vs</span>
                {nextMine.awayName ?? nextMine.projAway?.[0]?.name ?? nextMine.slotAway}
              </div>
              <div className="text-muted-foreground mt-1 text-xs">{etDateTime(nextMine.utc)} · {nextMine.ticketVenue ?? nextMine.venue}</div>
              <Link href="/matches" className="text-primary mt-2 inline-block text-xs font-medium">All my matches →</Link>
            </div>
          )}
          <NavCard href="/groups" title="Groups" desc="Standings, qualification odds & cut-offs" />
          <NavCard href="/bracket" title="Bracket" desc="Projected knockout tree to the final" />
          <NavCard href="/schedule" title="Schedule" desc="All 104 matches in ET" />
        </section>
      </div>

      <p className="text-muted-foreground/70 mt-10 text-xs">
        Elo + Poisson scoreline model (backtested RPS ~0.18), 2026 head-to-head-first tiebreakers, verified 495-row
        third-place table. <Link href="/methodology" className="text-primary">How it works →</Link>
      </p>
    </main>
  );
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="border-border bg-card hover:border-primary/50 block rounded-2xl border p-4 transition-colors">
      <div className="font-semibold">{title}</div>
      <div className="text-muted-foreground mt-0.5 text-xs">{desc}</div>
    </Link>
  );
}
