import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { etDateTime, etTime, etDayKey, pct } from "@/lib/format";
import { getSessionUser, getUserMatchNumbers } from "@/lib/userMatches";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROUND_SHORT: Record<string, string> = { GROUP: "", R32: "R32", R16: "R16", QF: "QF", SF: "SF", "3P": "3rd", FINAL: "Final" };

export default async function Page() {
  const data = await getPredictions();
  const updated = new Date(data.updatedAt);
  const contenders = data.teams.slice(0, 8);
  const maxTitle = contenders[0]?.title || 1;
  const user = await getSessionUser();
  const myNums = user ? new Set(await getUserMatchNumbers(user.id)) : new Set<number>();
  const now = new Date().getTime();
  const nextMine = data.matches
    .filter((m) => myNums.has(m.match) && new Date(m.utc).getTime() > now)
    .sort((a, b) => a.utc.localeCompare(b.utc))[0];
  const today = etDayKey(new Date().toISOString());
  const todayMatches = data.matches.filter((m) => etDayKey(m.utc) === today).sort((a, b) => a.utc.localeCompare(b.utc));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="text-primary font-mono text-[11px] font-medium tracking-wide uppercase">Live forecast</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">World Cup 2026 Predictions</h1>
        <p className="text-muted-foreground mt-2 text-sm text-pretty">
          {data.iterations.toLocaleString()} Monte Carlo simulations · {data.matchesPlayed}/{data.totalGroupMatches} group
          matches played · updated {updated.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET
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
                <span className="w-12 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">{pct(t.title)}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Side column */}
        <section className="space-y-4">
          {nextMine && (
            <div className="border-amber-500/40 bg-amber-500/5 rounded-2xl border p-4">
              <div className="mb-2 font-mono text-[11px] font-semibold tracking-wide text-amber-400 uppercase">🎟️ Your next match</div>
              <div className="text-sm font-semibold">
                {nextMine.homeName ?? nextMine.projHome?.[0]?.name ?? nextMine.slotHome}
                <span className="text-muted-foreground mx-1 font-normal">vs</span>
                {nextMine.awayName ?? nextMine.projAway?.[0]?.name ?? nextMine.slotAway}
              </div>
              <div className="text-muted-foreground mt-1 text-xs">{etDateTime(nextMine.utc)} · {nextMine.venue}</div>
              <Link href="/matches" className="text-primary mt-2 inline-block text-xs font-medium">All my matches →</Link>
            </div>
          )}
          <NavCard href="/groups" title="Groups" desc="Standings, qualification odds & cut-offs" />
          <NavCard href="/bracket" title="Bracket" desc="Projected knockout tree to the final" />
          <NavCard href="/schedule" title="Schedule" desc="All 104 matches in ET" />
          <NavCard
            href={user ? "/matches" : "/signin?next=/matches"}
            title="My Matches"
            desc={user ? "The games you're tracking" : "Sign in to save the games you're going to"}
          />
        </section>
      </div>

      {todayMatches.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wide uppercase">
            Today · {new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" })}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todayMatches.map((m) => <TodayTile key={m.match} m={m} />)}
          </div>
        </section>
      )}

      <footer className="border-border/60 text-muted-foreground/70 mt-12 border-t pt-6 text-xs text-pretty">
        Elo + Poisson scoreline model (backtested RPS ~0.18) with rating uncertainty, host advantage and an extra-time/penalty
        knockout model · 2026 head-to-head-first tiebreakers · verified 495-row third-place table. <Link href="/methodology" className="text-primary">How it works →</Link>
        <div className="mt-2">Live data via ESPN · not affiliated with FIFA.</div>
      </footer>
    </main>
  );
}

function TodayTile({ m }: { m: MatchInfo }) {
  const final = m.status === "final";
  const homeCode = m.home ?? m.projHome?.[0]?.code ?? null;
  const awayCode = m.away ?? m.projAway?.[0]?.code ?? null;
  const homeName = m.homeName ?? m.projHome?.[0]?.name ?? m.slotHome ?? "TBD";
  const awayName = m.awayName ?? m.projAway?.[0]?.name ?? m.slotAway ?? "TBD";
  return (
    <Link href={`/match/${m.match}`} className="border-border bg-card hover:border-primary/40 block rounded-xl border p-3">
      <div className="text-muted-foreground mb-2 flex items-center justify-between text-[11px]">
        <span className="font-mono">{etTime(m.utc)}</span>
        <span>{final ? <span className="text-emerald-400">FT</span> : (m.group ? `Group ${m.group}` : ROUND_SHORT[m.round])}</span>
      </div>
      <Row code={homeCode} name={homeName} score={final ? m.homeScore : undefined} win={final && (m.homeScore ?? 0) > (m.awayScore ?? 0)} projected={!m.home && m.round !== "GROUP"} />
      <Row code={awayCode} name={awayName} score={final ? m.awayScore : undefined} win={final && (m.awayScore ?? 0) > (m.homeScore ?? 0)} projected={!m.away && m.round !== "GROUP"} />
    </Link>
  );
}

function Row({ code, name, score, win, projected }: { code: string | null; name: string; score?: number; win?: boolean; projected?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Flag code={code} size={18} />
      <span className={`min-w-0 flex-1 truncate text-sm ${win ? "font-semibold" : projected ? "text-foreground/70" : ""}`}>{name}</span>
      {score != null && <span className={`shrink-0 font-mono text-sm tabular-nums ${win ? "font-bold" : "text-muted-foreground"}`}>{score}</span>}
    </div>
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
