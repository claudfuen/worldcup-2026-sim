import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { finalizeGroups, ratingsFromTeams } from "@/lib/liveProjection";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { MastheadVerdict } from "@/components/masthead-verdict";
import { MoverStrip } from "@/components/mover-strip";
import { TournamentStage } from "@/components/tournament-stage";
import { LiveTodayRail } from "@/components/live-today-rail";
import { MatchesToWatch } from "@/components/matches-to-watch";
import { BracketTeaser } from "@/components/bracket-teaser";
import { GroupsPreview } from "@/components/groups-preview";
import { TitleOdds } from "@/components/title-odds";
import { LaunchRail } from "@/components/launch-rail";
import { computeWatchability } from "@/lib/watchability";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const matches = overlayLive(data.matches, live);
  const hasLive = liveActivity(data.matches, live);
  // Finalize group clinch from results known right now, so the watch plan's decider signal is live-accurate.
  const groups = hasLive ? finalizeGroups(data.groups, matches, ratingsFromTeams(data.teams)) : data.groups;
  // Live-accurate group progress for the stage tracker (counts group finals as they land, ahead of cron).
  const groupPlayed = matches.filter((m) => m.round === "GROUP" && m.status === "final").length;
  // Hot-match reasons, so today's worth-watching games are badged in the live rail (consistent with the plan).
  const hotReasons: Record<number, string> = {};
  for (const p of computeWatchability(matches, data.teams, groups).byMatch.values()) {
    if (p.hot) hotReasons[p.match.match] = p.reason;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />

      {/* Dashboard: left = the call + live scores; right = a continuous snapshot rail (stage, bracket, groups) */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <header>
            <MastheadVerdict teams={data.teams} iterations={data.iterations} />
            <MoverStrip teams={data.teams} />
          </header>
          <LiveTodayRail matches={matches} hotReasons={hotReasons} />
        </div>
        <aside className="space-y-4">
          <TournamentStage matches={matches} matchesPlayed={groupPlayed} totalGroupMatches={data.totalGroupMatches} />
          <BracketTeaser matches={matches} teams={data.teams} />
          <GroupsPreview groups={groups} />
          <TitleOdds teams={data.teams} />
        </aside>
      </div>

      {/* What to watch next — the curated plan */}
      <MatchesToWatch matches={matches} teams={data.teams} groups={groups} className="mt-8" />

      <LaunchRail teams={data.teams} iterations={data.iterations} className="mt-12" />
    </main>
  );
}
