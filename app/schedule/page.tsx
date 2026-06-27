import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { ScheduleList } from "@/components/schedule-list";
import { MatchesToWatch } from "@/components/matches-to-watch";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCHED_TITLE = "World Cup 2026 Schedule & Predictions - All 104 Matches";
const SCHED_DESC =
  "All 104 matches of the 2026 World Cup in your local time, with the model favorite and live scores - group stage through the final.";
export const metadata = {
  title: { absolute: SCHED_TITLE },
  description: SCHED_DESC,
  alternates: { canonical: "/schedule" },
  openGraph: { title: SCHED_TITLE, description: SCHED_DESC, url: "/schedule", type: "website" },
  twitter: { card: "summary_large_image", title: SCHED_TITLE, description: SCHED_DESC },
};

export default async function SchedulePage() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const matches = overlayLive(data.matches, live);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={liveActivity(data.matches, live)} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">World Cup 2026 schedule</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          All 104 matches, shown in your local time. Undefined knockout slots show the most likely team; defined matches
          show the model favorite.
        </p>
      </div>
      <MatchesToWatch matches={matches} teams={data.teams} groups={data.groups} className="mb-8" />
      <ScheduleList matches={matches} />
    </main>
  );
}
