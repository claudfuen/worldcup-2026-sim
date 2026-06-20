import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { etDateTime, pct } from "@/lib/format";
import { MY_MATCH_NUMBERS } from "@/lib/data/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROUND_NAME: Record<string, string> = {
  GROUP: "Group stage", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3P": "Third-place play-off", FINAL: "Final",
};

export default async function MatchPage({ params }: { params: Promise<{ match: string }> }) {
  const { match } = await params;
  const data = await getPredictions();
  const m = data.matches.find((x) => x.match === Number(match));
  if (!m) notFound();
  const hasTicket = MY_MATCH_NUMBERS.includes(m.match);
  const state: "final" | "defined" | "undefined" = m.status === "final" ? "final" : m.defined ? "defined" : "undefined";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/schedule" className="text-muted-foreground hover:text-foreground text-sm">← Schedule</Link>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-foreground font-semibold">{ROUND_NAME[m.round]}{m.group ? ` · Group ${m.group}` : ""}</span>
        <span className="text-muted-foreground">Match {m.match}</span>
        {hasTicket && <span className="bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5 text-xs font-semibold">🎟️ You&apos;re going</span>}
      </div>
      <div className="text-muted-foreground mt-1 text-sm">{etDateTime(m.utc)} · {m.venue}, {m.city}</div>

      {/* Matchup header */}
      <div className="border-border bg-card mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border p-6">
        <SideHeader code={m.home ?? m.projHome?.[0]?.code ?? null} label={m.homeName ?? m.slotHome ?? "TBD"} defined={Boolean(m.home)} score={m.status === "final" ? m.homeScore : undefined} win={m.status === "final" && (m.homeScore ?? 0) > (m.awayScore ?? 0)} />
        <div className="text-muted-foreground text-center text-xs">{m.status === "final" ? "FT" : "vs"}</div>
        <SideHeader code={m.away ?? m.projAway?.[0]?.code ?? null} label={m.awayName ?? m.slotAway ?? "TBD"} defined={Boolean(m.away)} score={m.status === "final" ? m.awayScore : undefined} win={m.status === "final" && (m.awayScore ?? 0) > (m.homeScore ?? 0)} right />
      </div>

      {/* State-specific body */}
      {state === "final" && (
        <p className="text-muted-foreground mt-5 text-sm">
          Full time: <span className="text-foreground font-medium">{m.homeName} {m.homeScore}–{m.awayScore} {m.awayName}</span>.
        </p>
      )}

      {state === "defined" && m.probs && (
        <section className="mt-6">
          <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Win probability</h2>
          <div className="border-border bg-card space-y-3 rounded-2xl border p-5">
            <ProbRow label={m.homeName!} value={m.probs.home} />
            <ProbRow label="Draw" value={m.probs.draw} tone="muted" />
            <ProbRow label={m.awayName!} value={m.probs.away} />
            {m.round !== "GROUP" && (
              <p className="text-muted-foreground/70 pt-1 text-xs">Regulation result; knockout ties are decided by extra time and penalties.</p>
            )}
          </div>
        </section>
      )}

      {state === "undefined" && (
        <>
          <section className="mt-6">
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Most likely matchups</h2>
            <div className="border-border bg-card divide-border/50 divide-y rounded-2xl border">
              {(m.topMatchups ?? []).map((mu) => (
                <div key={`${mu.home}|${mu.away}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <Flag code={mu.home} size={18} /><span className="truncate">{mu.homeName}</span>
                  <span className="text-muted-foreground text-xs">v</span>
                  <Flag code={mu.away} size={18} /><span className="flex-1 truncate">{mu.awayName}</span>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">{pct(mu.prob)}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Candidates title={m.slotHome ?? "Home"} list={m.projHome} />
            <Candidates title={m.slotAway ?? "Away"} list={m.projAway} />
          </div>
        </>
      )}
    </main>
  );
}

function SideHeader({ code, label, defined, score, win, right }: { code: string | null; label: string; defined: boolean; score?: number; win?: boolean; right?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
      <Flag code={code} size={40} />
      <div>
        <div className={`text-lg font-semibold ${defined ? "" : "text-foreground/70"} ${win ? "text-emerald-400" : ""}`}>{label}</div>
        {score != null && <div className="font-mono text-3xl font-bold tabular-nums">{score}</div>}
      </div>
    </div>
  );
}

function ProbRow({ label, value, tone }: { label: string; value: number; tone?: "muted" }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm font-medium">{label}</span>
      <div className="bg-muted/40 relative h-2 flex-1 overflow-hidden rounded-full">
        <div className={`absolute inset-y-0 left-0 rounded-full ${tone === "muted" ? "bg-muted-foreground/50" : "bg-emerald-500"}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-sm tabular-nums">{pct(value)}</span>
    </div>
  );
}

function Candidates({ title, list }: { title: string; list?: { code: string; name: string; prob: number }[] }) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <div className="text-muted-foreground mb-2 text-[10px] tracking-wider uppercase">Likely · {title}</div>
      <div className="space-y-1.5">
        {(list ?? []).slice(0, 5).map((c) => (
          <div key={c.code} className="flex items-center gap-2 text-sm">
            <Flag code={c.code} size={16} /><span className="flex-1 truncate">{c.name}</span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{pct(Math.min(c.prob, 0.99))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
