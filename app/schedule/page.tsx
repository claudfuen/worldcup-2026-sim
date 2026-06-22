import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import { ScheduleList } from "@/components/schedule-list";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { getSessionUser, getUserMatchNumbers } from "@/lib/userMatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SchedulePage() {
  const user = await getSessionUser();
  const [data, live, myMatchNumbers] = await Promise.all([
    getPredictions(),
    getLiveMatches(),
    user ? getUserMatchNumbers(user.id) : Promise.resolve<number[]>([]),
  ]);
  const matches = overlayLive(data.matches, live);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <LiveAutoRefresh enabled={matches.some((m) => m.status === "live")} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          All 104 matches, times in ET. Undefined knockout slots show the most likely team; defined matches show the
          model favorite. Tap the 🎟️ to save a match to My Matches.
        </p>
      </div>
      <ScheduleList matches={matches} myMatchNumbers={myMatchNumbers} isAuthed={Boolean(user)} />
    </main>
  );
}
