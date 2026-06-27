import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { finalizeGroups, ratingsFromTeams } from "@/lib/liveProjection";
import { GROUPS } from "@/lib/data/teams";
import { teamSlug } from "@/lib/slug";
import { Flag } from "@/components/flag";
import { ShareBar } from "@/components/share-bar";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { LocalTime } from "@/components/local-time";
import { AdvanceBadge } from "@/components/view/advance-badge";
import { teamAdvanceDisplay } from "@/lib/view/advance";
import { pct } from "@/lib/format";
import { ProbMeter } from "@/components/prob-meter";
import { HotBadge } from "@/components/hot-badge";
import { computeWatchability } from "@/lib/watchability";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { type RelLink } from "@/components/related-links";
import { ExploreSection } from "@/components/explore-section";
import { BracketTeaser } from "@/components/bracket-teaser";
import { GroupsPreview } from "@/components/groups-preview";
import { TitleOdds } from "@/components/title-odds";
import type { GroupTeamView } from "@/lib/predictions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-request live overlay: a finished match shows its score at once

export function generateStaticParams() {
  return GROUPS.map((g) => ({ letter: g.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ letter: string }> }) {
  const { letter } = await params;
  const L = letter.toUpperCase();
  if (!GROUPS.includes(L)) return { title: "Group" };
  const canonical = `/group/${L.toLowerCase()}`;
  const title = `World Cup 2026 Group ${L}: Standings, Odds & Schedule`;
  const description = `2026 World Cup Group ${L}: live standings, each team's probability of advancing, the 2026 head-to-head tiebreakers, and all six fixtures.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GroupPage({ params }: { params: Promise<{ letter: string }> }) {
  const { letter } = await params;
  const L = letter.toUpperCase();
  if (!GROUPS.includes(L)) notFound();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  const hasLive = liveActivity(data.matches, live);
  // Finalize standings/clinch from results known right now, so a finished match updates the table instantly.
  const groups = hasLive ? finalizeGroups(data.groups, overlaid, ratingsFromTeams(data.teams)) : data.groups;
  const gv = groups.find((g) => g.group === L);
  if (!gv) notFound();
  const fixtures = overlaid
    .filter((m) => m.round === "GROUP" && m.group === L)
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const leader = gv.teams[0];
  const hotByMatch = computeWatchability(overlaid, data.teams, groups).byMatch;

  // A one-line "state of the group" verdict — who's through, who's chasing the third-place route, who's out.
  const through = gv.teams.filter((t) => t.status === "won_group" || t.status === "second" || t.status === "advanced");
  const out = gv.teams.filter((t) => t.status === "eliminated");
  const contending = gv.teams.filter((t) => t.status === "live").sort((a, b) => b.advance - a.advance);
  const verdict: string[] = [];
  if (through.length) verdict.push(`${nameList(through)} ${through.length === 1 ? "has" : "have"} qualified`);
  if (contending[0] && contending[0].advance > 0.02) verdict.push(`${contending[0].name} ${pct(contending[0].advance)} to advance`);
  if (out.length) verdict.push(`${nameList(out)} out`);

  // Thin secondary links beneath the preview cards: jump to the adjacent groups + the schedule (the bracket
  // and all-groups grid get rich preview cards below).
  const gi = GROUPS.indexOf(L);
  const related: RelLink[] = [];
  if (gi > 0) related.push({ label: `Group ${GROUPS[gi - 1]}`, href: `/group/${GROUPS[gi - 1].toLowerCase()}` });
  if (gi < GROUPS.length - 1) related.push({ label: `Group ${GROUPS[gi + 1]}`, href: `/group/${GROUPS[gi + 1].toLowerCase()}` });
  related.push({ label: "Full schedule", href: "/schedule" });
  related.push({ label: "How it works", href: "/methodology" });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Groups", href: "/groups" }, { label: `Group ${L}` }]} />
      <header className="mt-3 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">World Cup 2026</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Group {L} - 2026 World Cup standings & odds</h1>
        {verdict.length > 0 && (
          <p className="text-foreground mt-2 text-base text-pretty">{verdict.join(" · ")}.</p>
        )}
        <p className="text-muted-2 mt-2 text-xs text-pretty">
          Top 2 qualify directly; the 8 best third-placed teams also reach the Round of 32. Sorted by the 2026
          tiebreakers: points, then head-to-head, then goal difference.
        </p>
        <div className="mt-4">
          <ShareBar text={`World Cup 2026 Group ${L}: ${leader ? `${leader.name} lead` : "live standings"} + advancement odds.`} path={`/group/${letter.toLowerCase()}`} />
        </div>
      </header>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">Standings</h2>
          <div className="border-border bg-card overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-[10px] tracking-wide">
                <th className="py-2 pr-1 pl-3 text-left font-medium">Team</th>
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
              {gv.teams.map((t, i) => {
                const elim = t.status === "eliminated";
                const zone = i <= 1 ? "border-l-win" : i === 2 ? "border-l-contention" : "border-l-transparent";
                return (
                  <tr key={t.code} className={`border-border/40 border-b border-l-2 last:border-b-0 ${zone} ${elim ? "opacity-45" : ""}`}>
                    <td className="py-2 pr-1 pl-2.5">
                      <Link href={`/team/${teamSlug(t.name)}`} className="flex items-center gap-2 hover:underline">
                        <span className="text-muted-2 w-3 text-center font-mono text-[11px]">{i + 1}</span>
                        <Flag code={t.code} size={20} />
                        <span className={`truncate text-[13px] font-medium ${elim ? "line-through" : ""}`}>{t.name}</span>
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
                      {t.status === "live" ? (
                        <span className="inline-flex justify-end"><ProbMeter p={t.advance} width={18} className="text-muted-foreground text-[11px]" /></span>
                      ) : (
                        <AdvanceBadge d={teamAdvanceDisplay(t, i)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

        <section className="lg:col-span-2">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">Matches</h2>
          <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
          {fixtures.map((m) => {
            const final = m.status === "final";
            const live = m.status === "live";
            return (
              <Link key={m.match} href={`/match/${m.match}`} className="hover:bg-muted/30 flex items-center gap-3 px-4 py-2.5 transition-colors">
                <span className="text-muted-2 w-24 shrink-0 font-mono text-[11px]"><LocalTime utc={m.utc} mode="day" /></span>
                <Flag code={m.home} size={16} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.homeName} <span className="text-muted-foreground">v</span> {m.awayName}</span>
                {hotByMatch.get(m.match)?.hot && <HotBadge className="shrink-0" />}
                {(final || live) && (
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{m.homeScore}–{m.awayScore}</span>
                )}
              </Link>
            );
          })}
        </div>
        </section>
      </div>

      <ExploreSection links={related}>
        <GroupsPreview groups={groups} />
        <BracketTeaser matches={overlaid} teams={data.teams} />
        <TitleOdds teams={data.teams} />
      </ExploreSection>

      <p className="text-muted-2 mt-8 text-xs">
        Odds from {data.iterations.toLocaleString()} Monte Carlo simulations, updated live.{" "}
        <Link href="/methodology" className="text-primary">How it works →</Link>
      </p>
    </main>
  );
}

function Cell({ v, muted, cls }: { v: number | string; muted?: boolean; cls?: string }) {
  return <td className={`px-1 text-center font-mono text-xs tabular-nums ${muted ? "text-muted-foreground" : ""} ${cls ?? ""}`}>{v}</td>;
}

function nameList(ts: GroupTeamView[]): string {
  const n = ts.map((t) => t.name);
  if (n.length <= 1) return n.join("");
  if (n.length === 2) return `${n[0]} & ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
}
