import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity, attachLiveProbs } from "@/lib/live";
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
import { GoldenBootRace } from "@/components/golden-boot-race";
import { LaunchRail } from "@/components/launch-rail";
import { computeWatchability } from "@/lib/watchability";
import { getT } from "@/lib/i18n/server";
import { localizeTeams, localizeMatches, localizeGroups } from "@/lib/i18n/localize-payload";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const t = await getT();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const ratings = ratingsFromTeams(data.teams);
  // Overlay live scores, then attach the current (live-conditioned) win probability to each in-progress match.
  const matches = attachLiveProbs(overlayLive(data.matches, live), ratings);
  const hasLive = liveActivity(data.matches, live);
  // Finalize group clinch from results known right now, so the watch plan's decider signal is live-accurate.
  const groups = hasLive ? finalizeGroups(data.groups, matches, ratings) : data.groups;
  // Live-accurate group progress for the stage tracker (counts group finals as they land, ahead of cron).
  const groupPlayed = matches.filter((m) => m.round === "GROUP" && m.status === "final").length;
  // Hot-match reasons, so today's worth-watching games are badged in the live rail (consistent with the plan).
  const hotReasons: Record<number, string> = {};
  for (const p of computeWatchability(matches, data.teams, groups).byMatch.values()) {
    if (p.hot) hotReasons[p.match.match] = t(p.reason.key, p.reason.params);
  }

  // Localize team display names (codes → native names) on the FINAL structures, after the live
  // transforms above (which re-derive English names). watchability ran on the raw data, by code.
  const teams = localizeTeams(data.teams, t);
  const lMatches = localizeMatches(matches, t);
  const lGroups = localizeGroups(groups, t);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />

      {/* Dashboard: left = the call + live scores; right = a continuous snapshot rail (stage, bracket, groups) */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <header>
            <MastheadVerdict teams={teams} iterations={data.iterations} />
            <MoverStrip teams={teams} />
          </header>
          <LiveTodayRail matches={lMatches} hotReasons={hotReasons} />
        </div>
        <aside className="space-y-4">
          <TournamentStage matches={lMatches} matchesPlayed={groupPlayed} totalGroupMatches={data.totalGroupMatches} />
          <BracketTeaser matches={lMatches} teams={teams} />
          <GroupsPreview groups={lGroups} />
          <TitleOdds teams={teams} />
          <GoldenBootRace entries={data.awards.goldenBoot} />
        </aside>
      </div>

      {/* What to watch next — the curated plan */}
      <MatchesToWatch matches={lMatches} teams={teams} groups={lGroups} className="mt-8" />

      <LaunchRail teams={teams} iterations={data.iterations} className="mt-12" />
    </main>
  );
}
