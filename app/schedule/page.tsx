import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { ScheduleList } from "@/components/schedule-list";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { RelatedLinks } from "@/components/related-links";
import { computeWatchability } from "@/lib/watchability";

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
  const { byMatch } = computeWatchability(matches, data.teams, data.groups);
  const hotReasons: Record<number, string> = {};
  for (const p of byMatch.values()) if (p.hot) hotReasons[p.match.match] = p.reason;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={liveActivity(data.matches, live)} />
      <header className="mb-6 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">Full match schedule</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">World Cup 2026 schedule</h1>
        <p className="text-muted-foreground mt-2 text-base text-pretty">
          All 104 matches in your local time. Undefined knockout slots show the most likely team; defined matches show
          the model favorite.
        </p>
      </header>
      <ScheduleList matches={matches} hotReasons={hotReasons} />
      <RelatedLinks
        links={[
          { label: "Groups & standings", href: "/groups" },
          { label: "Bracket", href: "/bracket", hint: "knockout path" },
          { label: "Overview", href: "/", hint: "title race" },
        ]}
      />
    </main>
  );
}
