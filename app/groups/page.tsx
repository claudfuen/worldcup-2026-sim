import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { teamSlug } from "@/lib/slug";
import type { GroupTeamView } from "@/lib/predictions";
import { provisionalGroup, ratingsFromTeams, liveThirdPlaceRace, finalizeGroups, type ProvisionalGroup } from "@/lib/liveProjection";
import { Flag } from "@/components/flag";
import { ThirdPlaceRace } from "@/components/third-place-race";
import { AdvanceBadge } from "@/components/view/advance-badge";
import { teamAdvanceDisplay } from "@/lib/view/advance";
import { isClinched } from "@/lib/view/types";
import { ProvisionalStandings } from "@/components/provisional-standings";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { RelatedLinks } from "@/components/related-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GROUPS_TITLE = "World Cup 2026 Groups, Standings & Qualification Odds";
const GROUPS_DESC =
  "Live 2026 World Cup group standings with each team's probability of advancing, the 2026 head-to-head tiebreakers, and the best-third-place race for the Round of 32.";
export const metadata = {
  title: { absolute: GROUPS_TITLE },
  description: GROUPS_DESC,
  alternates: { canonical: "/groups" },
  openGraph: { title: GROUPS_TITLE, description: GROUPS_DESC, url: "/groups", type: "website" },
  twitter: { card: "summary_large_image", title: GROUPS_TITLE, description: GROUPS_DESC },
};

export default async function GroupsPage() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  const ratings = ratingsFromTeams(data.teams);
  const hasLive = liveActivity(data.matches, live);
  // Finalize standings/clinch from full-time results known right now (so a finished group locks instantly).
  const groups = hasLive ? finalizeGroups(data.groups, overlaid, ratings) : data.groups;
  const provByGroup: Record<string, ProvisionalGroup | null> = {};
  for (const g of groups) {
    provByGroup[g.group] = provisionalGroup(
      g.group,
      overlaid.filter((x) => x.round === "GROUP" && x.group === g.group),
      ratings,
    );
  }
  // Whenever results are moving (in-progress OR just-finished-before-cron), rebuild the third-place race
  // from the finalized groups so it stays consistent with the live group cards; otherwise the cron snapshot
  // (which also carries Annex-C slot data). Gated on hasLive, matching the cards — not just in-progress.
  const thirdRace = hasLive
    ? liveThirdPlaceRace(groups, provByGroup, ratings, data.thirdPlaceRace)
    : (data.thirdPlaceRace ?? []);
  // A one-line state-of-the-group-stage verdict, mirroring the editorial lede on the other pages.
  const decidedCount = groups.filter((g) => g.decided).length;
  const qualified = groups
    .flatMap((g) => g.teams)
    .filter((t) => t.status === "won_group" || t.status === "second" || t.status === "advanced").length;
  const verdict =
    decidedCount === groups.length
      ? `All ${groups.length} groups are settled — the 32-team Round of 32 field is set.`
      : `${decidedCount} of ${groups.length} groups settled · ${qualified} teams through to the Round of 32 · the final places ride on the best-third race below.`;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <header className="mb-6 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">Group stage standings</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">World Cup 2026 groups</h1>
        <p className="text-foreground mt-2 text-base text-pretty">{verdict}</p>
        <p className="text-muted-2 mt-2 text-xs text-pretty">
          Each team&apos;s probability of advancing. Top 2 qualify directly; the 8 best third-placed teams also reach the
          Round of 32. Sorted by the 2026 tiebreakers (points → head-to-head → goal difference).
        </p>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
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
      <ThirdPlaceRace entries={thirdRace} />
      <RelatedLinks
        links={[
          { label: "Bracket", href: "/bracket", hint: "knockout path" },
          { label: "Full schedule", href: "/schedule" },
          { label: "Overview", href: "/", hint: "title race" },
        ]}
      />
    </main>
  );
}

function GroupCard({ group, teams, decided, prov }: { group: string; teams: GroupTeamView[]; decided: boolean; prov?: ProvisionalGroup | null }) {
  const live = !!prov;
  return (
    <div className={`bg-card overflow-hidden rounded-2xl border ${live ? "border-live/40" : "border-border"}`}>
      <div className="border-border/60 flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-semibold"><Link href={`/group/${group.toLowerCase()}`} className="hover:text-primary transition-colors">Group {group}</Link></h2>
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
              <Link href={`/team/${teamSlug(t.name)}`} className="flex shrink-0 items-center gap-1.5 hover:underline">
                <Flag code={t.code} size={14} />
                <span className="text-foreground/80 font-medium">{t.name}</span>
              </Link>
              <span className="text-muted-foreground">{t.need}</span>
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
  const d = teamAdvanceDisplay(t, pos - 1);
  const elim = d.kind === "eliminated";
  const zone = pos <= 2 ? "border-l-win" : pos === 3 ? "border-l-contention" : "border-l-transparent";
  const cutBorder = cut === "qualify" ? "border-b-primary/50 border-b border-dashed" : cut === "third" ? "border-b-border border-b border-dotted" : "";
  return (
    <tr className={`border-l-2 ${zone} ${cutBorder} ${elim ? "opacity-45" : ""}`}>
      <td className="py-2 pr-1 pl-2.5">
        <Link href={`/team/${teamSlug(t.name)}`} className="flex items-center gap-2 hover:underline">
          <span className="text-muted-foreground w-3 text-center font-mono text-[11px]">{pos}</span>
          <Flag code={t.code} size={20} />
          <span className={`truncate text-[13px] font-medium ${elim ? "line-through" : ""}`}>{t.name}{elim && <span className="sr-only"> (eliminated)</span>}</span>
          {isClinched(d) && d.symbol && (
            <span title={d.kind === "wonGroup" ? "Won the group" : "Advanced"} className={d.kind === "wonGroup" ? "text-[10px]" : "text-win text-[9px] font-bold"}>
              {d.symbol}<span className="sr-only"> {d.kind === "wonGroup" ? "Won group" : "advanced"}</span>
            </span>
          )}
        </Link>
      </td>
      <Cell v={t.played} muted />
      <Cell v={t.w} muted />
      <Cell v={t.d} muted />
      <Cell v={t.l} muted />
      <Cell v={t.gf} muted cls="hidden sm:table-cell" />
      <Cell v={t.ga} muted cls="hidden sm:table-cell" />
      <Cell v={(t.gd >= 0 ? "+" : "") + t.gd} />
      <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{t.pts}</td>
      <td className="px-1 pr-3 text-right">
        <AdvanceBadge d={d} showDelta />
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
