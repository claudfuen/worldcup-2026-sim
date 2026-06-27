import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { finalizeGroups, finalizeBracket, ratingsFromTeams } from "@/lib/liveProjection";
import { Bracket } from "@/components/bracket";
import { Flag } from "@/components/flag";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { ShareBar } from "@/components/share-bar";
import { forecastPct } from "@/lib/format";
import { teamSlug } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BRACKET_TITLE = "World Cup 2026 Bracket Predictor - Live Knockout Simulation";
const BRACKET_DESC =
  "Projected 2026 World Cup knockout bracket: the most likely team in every Round-of-32 to Final slot, with full FIFA Annex C third-place modelling, updated live.";
export const metadata = {
  title: { absolute: BRACKET_TITLE },
  description: BRACKET_DESC,
  alternates: { canonical: "/bracket" },
  openGraph: { title: BRACKET_TITLE, description: BRACKET_DESC, url: "/bracket", type: "website" },
  twitter: { card: "summary_large_image", title: BRACKET_TITLE, description: BRACKET_DESC },
};

export default async function BracketPage() {
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const hasLive = liveActivity(data.matches, live);
  // Lock knockout participants the instant their group decides (and resolve third-place slots once the
  // group stage completes), rather than waiting for the next cron tick.
  const overlaid = overlayLive(data.matches, live);
  const ratings = ratingsFromTeams(data.teams);
  const matches = hasLive ? finalizeBracket(overlaid, finalizeGroups(data.groups, overlaid, ratings), ratings) : data.matches;
  const champ = data.teams[0];
  const finalM = matches.find((m) => m.round === "FINAL");
  const fHomeName = finalM?.homeName ?? finalM?.projHome?.[0]?.name ?? null;
  const fAwayName = finalM?.awayName ?? finalM?.projAway?.[0]?.name ?? null;
  const r32 = matches.filter((m) => m.round === "R32");
  const r32Set = r32.filter((m) => m.defined).length;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <header className="mb-6 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">Projected knockout bracket</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">World Cup 2026 bracket</h1>
        {champ && (
          <p className="mt-3 text-base text-pretty">
            The model&apos;s road to the final:{" "}
            <Link href={`/team/${teamSlug(champ.name)}`} className="text-foreground font-semibold hover:underline">{champ.name}</Link> are projected to lift the trophy{" "}
            <span className="text-primary font-semibold tabular-nums">{forecastPct(champ.title)}</span>
            {fHomeName && fAwayName && <>, with a <span className="text-foreground/90 font-medium">{fHomeName}</span>–<span className="text-foreground/90 font-medium">{fAwayName}</span> final the most likely outcome</>}.
            <span className="text-muted-foreground"> {r32Set} of {r32.length} Round-of-32 ties are confirmed; the rest are projections.</span>
          </p>
        )}
        <p className="text-muted-2 mt-3 text-xs text-pretty">
          Each <span className="text-foreground/70">%</span> is how often a team fills that slot across our simulations — not its
          chance of winning the match. Third-place slots lock once the group stage ends; resolved teams are bold. Scroll across
          to follow the path to the final.
        </p>
        {champ && (
          <div className="mt-4">
            <ShareBar
              text={`The model's projected World Cup 2026 champion: ${champ.name} (${forecastPct(champ.title)}). See the full bracket:`}
              path="/bracket"
            />
          </div>
        )}
      </header>
      <Bracket
        matches={matches}
        champion={data.teams[0] ? { code: data.teams[0].code, name: data.teams[0].name, prob: data.teams[0].title } : undefined}
      />
      <div className="border-border bg-card mt-6 rounded-2xl border p-4">
        <h2 className="mb-2 text-base font-semibold tracking-tight">Third-place play-off</h2>
        <ThirdPlace matches={matches} />
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
