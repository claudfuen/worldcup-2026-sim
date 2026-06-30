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
import { StadiumSpotlight } from "@/components/stadium-spotlight";
import { PlayersToWatch } from "@/components/players-to-watch";
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

  // Once every group match is in, the group stage is settled — drop the (now-static) groups snapshot so the
  // homepage doesn't carry dead weight into the knockouts.
  const groupStageOver = groupPlayed >= data.totalGroupMatches;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />

      {/* The call — the hero, full width */}
      <header>
        <MastheadVerdict teams={teams} iterations={data.iterations} complete={data.complete} champion={data.champion} finalMatch={lMatches.find((mm) => mm.round === "FINAL")} />
        <MoverStrip teams={teams} />
      </header>

      {/* Where the whole tournament is — a full-width progress strip under the call */}
      <TournamentStage matches={lMatches} matchesPlayed={groupPlayed} totalGroupMatches={data.totalGroupMatches} className="mt-6" />

      {/* Clear tiers, stacked so neither side can tower over a thin other side. TIER 2 — the live heartbeat:
          a full-width primary feed (on now / today / next / just finished), its sections flowing into balanced
          internal columns so a wide row never looks empty. TIER 3 — a quieter row of reference tiles (bracket
          heading, title race, golden boot), visibly smaller so they read as secondary. */}
      <LiveTodayRail matches={lMatches} hotReasons={hotReasons} className="mt-8" />

      {/* Where it's being played — the next/live venue, over a real photo of the stadium */}
      <StadiumSpotlight matches={lMatches} className="mt-8" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BracketTeaser matches={lMatches} teams={teams} />
        {!groupStageOver && <GroupsPreview groups={lGroups} />}
        <TitleOdds teams={teams} />
        <GoldenBootRace entries={data.awards.goldenBoot} />
      </div>

      {/* The faces of the tournament — top scorers as a headshot rail */}
      <PlayersToWatch entries={data.awards.goldenBoot} className="mt-8" />

      {/* What to watch next — the curated plan */}
      <MatchesToWatch matches={lMatches} teams={teams} groups={lGroups} className="mt-8" />

      <LaunchRail teams={teams} iterations={data.iterations} className="mt-12" />
    </main>
  );
}
