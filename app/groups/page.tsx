import { getPredictions } from "@/lib/getPredictions";
import type { GroupTeamView, ThirdPlaceEntry } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { pct } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GroupsPage() {
  const data = await getPredictions();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Live standings with each team&apos;s probability of advancing. Top 2 qualify directly; the 8 best third-placed
          teams also reach the Round of 32. Sorted by the 2026 tiebreakers (points → head-to-head → goal difference).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.groups.map((g) => (
          <GroupCard key={g.group} group={g.group} teams={g.teams} decided={g.decided} />
        ))}
      </div>
      <Legend />
      <p className="text-muted-foreground/70 mt-3 max-w-3xl text-xs">
        Advance % blends each team&apos;s strength with results so far, so early in the group a strong side can show
        higher odds than a team placed above it - 3 of every 4 advance, and there are still games to play.
      </p>
      <ThirdPlaceRace entries={data.thirdPlaceRace ?? []} />
    </main>
  );
}

function ThirdPlaceRace({ entries }: { entries: ThirdPlaceEntry[] }) {
  if (!entries.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Third-place race</h2>
      <p className="text-muted-foreground mt-1 mb-3 text-sm">
        The <span className="text-foreground">8 best</span>{" "}of the 12 third-placed teams also reach the Round of 32,
        ranked across groups by points → goal difference → goals scored. Each qualifier is slotted to a specific group
        winner by FIFA&apos;s fixed Annex C table (shown as the R32 match it feeds).
      </p>
      <div className="border-border bg-card overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-border/60 border-b text-[10px] tracking-wide">
              <th className="py-2 pr-1 pl-3 text-left font-medium">#</th>
              <th className="py-2 text-left font-medium">Third-placed team</th>
              <th className="w-8 px-1 text-center font-medium">GF</th>
              <th className="w-8 px-1 text-center font-medium">GD</th>
              <th className="w-8 px-1 text-center font-semibold">Pts</th>
              <th className="px-2 pr-3 text-right font-medium">Round of 32</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.code} className={`border-l-2 ${e.advancing ? "border-l-amber-500" : "border-l-transparent opacity-50"} ${e.rank === 8 ? "border-b-primary/50 border-b border-dashed" : ""}`}>
                <td className="py-2 pr-1 pl-3 text-muted-foreground font-mono text-[11px]">{e.rank}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <Flag code={e.code} size={20} />
                    <span className="text-[13px] font-medium">{e.name}</span>
                    <span className="text-muted-foreground text-[11px]">Grp {e.group}</span>
                  </div>
                </td>
                <td className="px-1 text-center font-mono text-xs tabular-nums text-muted-foreground">{e.gf}</td>
                <td className="px-1 text-center font-mono text-xs tabular-nums">{e.gd >= 0 ? "+" : ""}{e.gd}</td>
                <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{e.pts}</td>
                <td className="px-2 pr-3 text-right text-xs">
                  {e.advancing && e.match ? (
                    <span className="text-amber-400">M{e.match} · vs {e.facesGroup} winner</span>
                  ) : (
                    <span className="text-muted-foreground/60">out (9th-12th)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground/60 mt-2 text-xs">Live order based on current standings; the slot assignment updates as the qualifying set of groups changes (495 possible combinations).</p>
    </section>
  );
}

function GroupCard({ group, teams, decided }: { group: string; teams: GroupTeamView[]; decided: boolean }) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="border-border/60 flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-semibold">Group {group}</h2>
        <span className={`text-[10px] font-medium font-mono tracking-wide uppercase ${decided ? "text-emerald-400" : "text-muted-foreground"}`}>
          {decided ? "Final" : "In progress"}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-[10px] tracking-wide">
            <th className="py-1.5 pr-1 pl-3 text-left font-medium">Team</th>
            <th className="w-6 px-1 text-center font-medium" title="Played">P</th>
            <th className="w-6 px-1 text-center font-medium" title="Won">W</th>
            <th className="w-6 px-1 text-center font-medium" title="Drawn">D</th>
            <th className="w-6 px-1 text-center font-medium" title="Lost">L</th>
            <th className="w-7 px-1 text-center font-medium" title="Goals for">GF</th>
            <th className="w-7 px-1 text-center font-medium" title="Goals against">GA</th>
            <th className="w-7 px-1 text-center font-medium" title="Goal difference">GD</th>
            <th className="w-7 px-1 text-center font-semibold" title="Points">Pts</th>
            <th className="w-12 px-1 pr-3 text-right font-medium" title="Probability of advancing">Adv</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <Row key={t.code} t={t} pos={i + 1} cut={i === 1 ? "qualify" : i === 2 ? "third" : null} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ t, pos, cut }: { t: GroupTeamView; pos: number; cut: "qualify" | "third" | null }) {
  const elim = t.status === "eliminated";
  const zone = pos <= 2 ? "border-l-emerald-500" : pos === 3 ? "border-l-amber-500" : "border-l-transparent";
  const cutBorder = cut === "qualify" ? "border-b-primary/50 border-b border-dashed" : cut === "third" ? "border-b-border border-b border-dotted" : "";
  return (
    <tr className={`border-l-2 ${zone} ${cutBorder} ${elim ? "opacity-45" : ""}`}>
      <td className="py-2 pr-1 pl-2.5">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-3 text-center font-mono text-[11px]">{pos}</span>
          <Flag code={t.code} size={20} />
          <span className={`truncate text-[13px] font-medium ${elim ? "line-through" : ""}`}>{t.name}</span>
          {t.status === "won_group" && <span title="Won the group" className="text-[10px]">👑</span>}
          {(t.status === "second" || t.status === "advanced") && <span title="Advanced" className="text-[9px] font-bold text-emerald-400">✓</span>}
        </div>
      </td>
      <Cell v={t.played} muted />
      <Cell v={t.w} muted />
      <Cell v={t.d} muted />
      <Cell v={t.l} muted />
      <Cell v={t.gf} muted />
      <Cell v={t.ga} muted />
      <Cell v={(t.gd >= 0 ? "+" : "") + t.gd} />
      <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{t.pts}</td>
      <td className="px-1 pr-3 text-right font-mono text-xs font-semibold tabular-nums">
        {t.status === "won_group" ? (
          <span className="text-emerald-400">✓ 1st</span>
        ) : t.status === "second" ? (
          <span className="text-emerald-400">✓ 2nd</span>
        ) : t.status === "advanced" ? (
          <span className="text-emerald-400">✓ in</span>
        ) : t.status === "eliminated" ? (
          <span className="text-muted-foreground/70">out</span>
        ) : (
          <span className={pos <= 2 ? "text-emerald-400" : pos === 3 ? "text-amber-400" : "text-muted-foreground"}>{pct(Math.min(t.advance, 0.99))}</span>
        )}
      </td>
    </tr>
  );
}

function Cell({ v, muted }: { v: number | string; muted?: boolean }) {
  return <td className={`px-1 text-center font-mono text-xs tabular-nums ${muted ? "text-muted-foreground" : ""}`}>{v}</td>;
}

function Legend() {
  return (
    <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-sm bg-emerald-500" /> Direct qualification (top 2)</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-sm bg-amber-500" /> Best-third contention (3rd)</span>
      <span className="flex items-center gap-1.5"><span className="font-bold text-emerald-400">✓</span> Clinched</span>
      <span className="flex items-center gap-1.5"><span className="line-through">Team</span> Eliminated</span>
      <span>Adv = P(reach Round of 32)</span>
    </div>
  );
}
