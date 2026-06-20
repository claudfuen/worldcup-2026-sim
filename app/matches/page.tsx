import { getPredictions } from "@/lib/getPredictions";
import type { MyMatch, SlotCandidate } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { etDateTime, pct } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MatchesPage() {
  const data = await getPredictions();
  const totalTickets = data.myMatches.reduce((s, m) => s + m.tickets, 0);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">My matches</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {`${data.myMatches.length} matches · ${totalTickets} tickets.`} For undefined knockout slots, the most likely
          teams you&apos;ll see, per the model.
        </p>
      </div>
      <div className="space-y-4">
        {data.myMatches.map((m) => <TicketCard key={m.match} m={m} />)}
      </div>
    </main>
  );
}

function TicketCard({ m }: { m: MyMatch }) {
  const roundName: Record<string, string> = { GROUP: m.group ? `Group ${m.group}` : "Group", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", FINAL: "Final" };
  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="border-border/60 flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5 text-[11px] font-semibold">🎟️ {m.tickets}</span>
          <span className="text-sm font-semibold">{roundName[m.round]}</span>
          <span className="text-muted-foreground text-xs">M{m.match}</span>
        </div>
        <span className="text-muted-foreground text-xs">{etDateTime(m.utc)}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
        <SideBlock label={m.defined ? "" : "Likely"} code={m.home} title={m.homeName} candidates={m.projHome} slot={m.slotHome} />
        <SideBlock label={m.defined ? "" : "Likely"} code={m.away} title={m.awayName} candidates={m.projAway} slot={m.slotAway} />
      </div>
      {!m.defined && m.topMatchups && m.topMatchups.length > 0 && (
        <div className="border-border/50 border-t px-4 py-3">
          <div className="text-muted-foreground mb-2 text-[10px] tracking-wider uppercase">Most likely matchups</div>
          <div className="space-y-1.5">
            {m.topMatchups.map((mu) => (
              <div key={`${mu.home}|${mu.away}`} className="flex items-center gap-2 text-sm">
                <Flag code={mu.home} size={16} />
                <span className="truncate">{mu.homeName}</span>
                <span className="text-muted-foreground text-xs">v</span>
                <Flag code={mu.away} size={16} />
                <span className="flex-1 truncate">{mu.awayName}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">{pct(mu.prob)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="border-border/50 text-muted-foreground border-t px-4 py-2 text-xs">
        📍 {m.ticketVenue ?? m.venue}{m.note ? ` · ${m.note}` : ""}
      </div>
    </div>
  );
}

function SideBlock({ label, code, title, candidates, slot }: { label: string; code: string | null; title: string | null; candidates?: SlotCandidate[]; slot?: string }) {
  if (title) {
    return (
      <div className="flex items-center gap-2">
        <Flag code={code} size={26} />
        <span className="text-lg font-semibold">{title}</span>
      </div>
    );
  }
  const list = candidates ?? [];
  return (
    <div>
      <div className="text-muted-foreground mb-1.5 text-[10px] tracking-wider uppercase">{label} · {slot}</div>
      <div className="space-y-1">
        {list.slice(0, 3).map((c) => (
          <div key={c.code} className="flex items-center gap-2">
            <Flag code={c.code} size={18} />
            <span className="flex-1 truncate text-sm">{c.name}</span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{pct(c.prob)}</span>
          </div>
        ))}
        {list.length === 0 && <span className="text-muted-foreground text-sm">TBD</span>}
      </div>
    </div>
  );
}
