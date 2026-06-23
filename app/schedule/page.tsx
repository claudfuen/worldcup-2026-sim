import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import { ScheduleList } from "@/components/schedule-list";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: { absolute: "World Cup 2026 Schedule & Predictions - All 104 Matches" },
  description:
    "All 104 matches of the 2026 World Cup in your local time, with the model favorite and live scores - group stage through the final.",
  alternates: { canonical: "/schedule" },
};

export default async function SchedulePage() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const matches = overlayLive(data.matches, live);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={matches.some((m) => m.status === "live")} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">World Cup 2026 schedule</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          All 104 matches, shown in your local time. Undefined knockout slots show the most likely team; defined matches
          show the model favorite.
        </p>
      </div>
      <ScheduleList matches={matches} />
    </main>
  );
}
