import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import type { GroupTeamView, ThirdPlaceEntry } from "@/lib/predictions";
import { provisionalGroup, ratingsFromTeams, type ProvisionalGroup } from "@/lib/liveProjection";
import { Flag } from "@/components/flag";
import { Delta } from "@/components/delta";
import { ProvisionalStandings } from "@/components/provisional-standings";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { pct } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: { absolute: "World Cup 2026 Groups, Standings & Qualification Odds" },
  description:
    "Live 2026 World Cup group standings with each team's probability of advancing, the 2026 head-to-head tiebreakers, and the best-third-place race for the Round of 32.",
  alternates: { canonical: "/groups" },
};

export default async function GroupsPage() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  const ratings = ratingsFromTeams(data.teams);
  const provByGroup: Record<string, ProvisionalGroup | null> = {};
  for (const g of data.groups) {
    provByGroup[g.group] = provisionalGroup(
      g.group,
      overlaid.filter((x) => x.round === "GROUP" && x.group === g.group),
      ratings,
    );
  }
  const hasLive = overlaid.some((m) => m.status === "live");
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">World Cup 2026 groups</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Live standings with each team&apos;s probability of advancing. Top 2 qualify directly; the 8 best third-placed
          teams also reach the Round of 32. Sorted by the 2026 tiebreakers (points → head-to-head → goal difference).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.groups.map((g) => (
          <GroupCard key={g.group} group={g.group} teams={g.teams} decided={g.decided} prov={provByGroup[g.group]} />
        ))}
      </div>
      <Legend />
      <p className="text-muted-2 mt-3 max-w-3xl text-xs">
        Advance % blends each team&apos;s strength with results so far, so early in the group a strong side can show
        higher odds than a team placed above it - 3 of every 4 advance, and there are still games to play. A % is always
        a forecast: even 99% isn&apos;t mathematically safe. Only a <span className="font-bold text-win">✓</span>{" "}
        marks a spot that&apos;s locked no matter the remaining results. The{" "}
        <span className="text-win">▲</span><span className="text-destructive">▼</span> next to a team show how its
        advance odds have moved since the start of today.
      </p>
      <ThirdPlaceRace entries={data.thirdPlaceRace ?? []} />
    </main>
  );
}

function ThirdPlaceRace({ entries }: { entries: ThirdPlaceEntry[] }) {
  if (!entries.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold tracking-tight">Third-place race</h2>
      <p className="text-muted-foreground mt-1 mb-3 text-sm">
        The <span className="text-foreground">8 best</span>{" "}of the 12 third-placed teams also reach the Round of 32,
        ranked across groups by points → goal difference → goals scored. This is the standings race as it stands now;
        the bracket shows each projected third&apos;s Round-of-32 matchup (which group winner it faces depends on the
        final mix, per FIFA&apos;s Annex C table).
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
              <th className="px-2 pr-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.code} className={`border-l-2 ${e.advancing ? "border-l-contention" : "border-l-transparent opacity-50"} ${e.rank === 8 ? "border-b-primary/50 border-b border-dashed" : ""}`}>
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
                  {e.advancing ? (
                    <span className="text-contention">In (top 8)</span>
                  ) : (
                    <span className="text-muted-2">Out (9th-12th)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-2 mt-2 text-xs">Live order based on current standings; the slot assignment updates as the qualifying set of groups changes (495 possible combinations).</p>
    </section>
  );
}

function GroupCard({ group, teams, decided, prov }: { group: string; teams: GroupTeamView[]; decided: boolean; prov?: ProvisionalGroup | null }) {
  const live = !!prov;
  return (
    <div className={`bg-card overflow-hidden rounded-2xl border ${live ? "border-live/40" : "border-border"}`}>
      <div className="border-border/60 flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-semibold">Group {group}</h2>
        {live ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wide text-live uppercase">
            <span className="size-1.5 animate-pulse rounded-full bg-live" />Live
          </span>
        ) : (
          <span className={`font-mono text-[10px] font-semibold tracking-wide uppercase ${decided ? "text-win" : "text-muted-foreground"}`}>
            {decided ? "Final" : "In progress"}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-[10px] tracking-wide">
            <th className="py-1.5 pr-1 pl-3 text-left font-medium">Team</th>
            <th className="w-6 px-1 text-center font-medium" title="Played">P</th>
            <th className="w-6 px-1 text-center font-medium" title="Won">W</th>
            <th className="w-6 px-1 text-center font-medium" title="Drawn">D</th>
            <th className="w-6 px-1 text-center font-medium" title="Lost">L</th>
            <th className="hidden w-7 px-1 text-center font-medium sm:table-cell" title="Goals for">GF</th>
            <th className="hidden w-7 px-1 text-center font-medium sm:table-cell" title="Goals against">GA</th>
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
      {teams.some((t) => t.need) && (
        <div className="border-border/60 space-y-1.5 border-t px-4 py-3">
          {teams.filter((t) => t.need).map((t) => (
            <div key={t.code} className="flex items-center gap-2 text-xs">
              <Flag code={t.code} size={14} />
              <span className="text-muted-foreground">
                <span className="text-foreground/80 font-medium">{t.name}:</span> {t.need}
              </span>
            </div>
          ))}
        </div>
      )}
      {prov && (
        <div className="border-border/60 border-t pt-2">
          <ProvisionalStandings proj={prov} bare />
        </div>
      )}
    </div>
  );
}

function Row({ t, pos, cut }: { t: GroupTeamView; pos: number; cut: "qualify" | "third" | null }) {
  const elim = t.status === "eliminated";
  const zone = pos <= 2 ? "border-l-win" : pos === 3 ? "border-l-contention" : "border-l-transparent";
  const cutBorder = cut === "qualify" ? "border-b-primary/50 border-b border-dashed" : cut === "third" ? "border-b-border border-b border-dotted" : "";
  return (
    <tr className={`border-l-2 ${zone} ${cutBorder} ${elim ? "opacity-45" : ""}`}>
      <td className="py-2 pr-1 pl-2.5">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-3 text-center font-mono text-[11px]">{pos}</span>
          <Flag code={t.code} size={20} />
          <span className={`truncate text-[13px] font-medium ${elim ? "line-through" : ""}`}>{t.name}{elim && <span className="sr-only"> (eliminated)</span>}</span>
          {t.status === "won_group" && <span title="Won the group" className="text-[10px]">👑<span className="sr-only">Won group</span></span>}
          {(t.status === "second" || t.status === "advanced") && <span title="Advanced" className="text-win text-[9px] font-bold">✓<span className="sr-only"> advanced</span></span>}
        </div>
      </td>
      <Cell v={t.played} muted />
      <Cell v={t.w} muted />
      <Cell v={t.d} muted />
      <Cell v={t.l} muted />
      <Cell v={t.gf} muted cls="hidden sm:table-cell" />
      <Cell v={t.ga} muted cls="hidden sm:table-cell" />
      <Cell v={(t.gd >= 0 ? "+" : "") + t.gd} />
      <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{t.pts}</td>
      <td className="px-1 pr-3 text-right font-mono text-xs font-semibold tabular-nums">
        {t.status === "won_group" ? (
          <span className="text-win">✓ 1st</span>
        ) : t.status === "second" ? (
          <span className="text-win">✓ 2nd</span>
        ) : t.status === "advanced" ? (
          <span className="text-win">✓ in</span>
        ) : t.status === "eliminated" ? (
          <span className="text-muted-2">out</span>
        ) : (
          <span className={pos <= 2 ? "text-win" : pos === 3 ? "text-contention" : "text-muted-foreground"}>
            {pct(Math.min(t.advance, 0.99))}<Delta v={t.advanceDelta} />
          </span>
        )}
      </td>
    </tr>
  );
}

function Cell({ v, muted, cls }: { v: number | string; muted?: boolean; cls?: string }) {
  return <td className={`px-1 text-center font-mono text-xs tabular-nums ${muted ? "text-muted-foreground" : ""} ${cls ?? ""}`}>{v}</td>;
}

function Legend() {
  return (
    <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-sm bg-win" /> Direct qualification (top 2)</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-sm bg-contention" /> Best-third contention (3rd)</span>
      <span className="flex items-center gap-1.5"><span className="font-bold text-win">✓</span> Clinched</span>
      <span className="flex items-center gap-1.5"><span className="line-through">Team</span> Eliminated</span>
      <span>Adv = P(reach Round of 32)</span>
    </div>
  );
}
