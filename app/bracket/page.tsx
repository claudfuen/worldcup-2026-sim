import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches } from "@/lib/live";
import { Bracket } from "@/components/bracket";
import { Flag } from "@/components/flag";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { ShareBar } from "@/components/share-bar";
import { forecastPct } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: { absolute: "World Cup 2026 Bracket Predictor - Live Knockout Simulation" },
  description:
    "Projected 2026 World Cup knockout bracket: the most likely team in every Round-of-32 to Final slot, with full FIFA Annex C third-place modelling, updated live.",
  alternates: { canonical: "/bracket" },
};

export default async function BracketPage() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={live.length > 0} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">World Cup 2026 bracket</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Most likely team in each slot. Each <span className="text-foreground/80">%</span> is how often that team fills
          the slot across our simulations - not its chance of winning the match. Third-place slots show the most likely
          qualifier (a best-third can come from any of several groups, per FIFA&apos;s Annex C table) and lock to the
          exact team once the group stage ends. Resolved teams are bold. Scroll horizontally to follow the path to the final.
        </p>
        {data.teams[0] && (
          <div className="mt-4">
            <ShareBar
              text={`The model's projected World Cup 2026 champion: ${data.teams[0].name} (${forecastPct(data.teams[0].title)}). See the full bracket:`}
              path="/bracket"
            />
          </div>
        )}
      </div>
      <Bracket
        matches={data.matches}
        champion={data.teams[0] ? { code: data.teams[0].code, name: data.teams[0].name, prob: data.teams[0].title } : undefined}
      />
      <div className="border-border bg-card mt-6 rounded-2xl border p-4">
        <h2 className="mb-2 text-base font-semibold tracking-tight">Third-place play-off</h2>
        <ThirdPlace matches={data.matches} />
      </div>
    </main>
  );
}

function ThirdPlace({ matches }: { matches: { match: number; projHome?: { code: string; name: string }[]; projAway?: { code: string; name: string }[] }[] }) {
  const m = matches.find((x) => x.match === 103);
  if (!m) return null;
  const h = m.projHome?.[0];
  const a = m.projAway?.[0];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {h && <Flag code={h.code} size={16} />}
      <span className="text-foreground/90">{h?.name ?? "TBD"}</span>
      <span className="text-muted-foreground">vs</span>
      {a && <Flag code={a.code} size={16} />}
      <span className="text-foreground/90">{a?.name ?? "TBD"}</span>
      <span className="text-muted-2">· Miami, Jul 18</span>
    </div>
  );
}
