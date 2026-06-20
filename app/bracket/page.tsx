import { getPredictions } from "@/lib/getPredictions";
import { Bracket } from "@/components/bracket";
import { getSessionUser, getUserMatchNumbers } from "@/lib/userMatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BracketPage() {
  const user = await getSessionUser();
  const [data, myMatchNumbers] = await Promise.all([
    getPredictions(),
    user ? getUserMatchNumbers(user.id) : Promise.resolve<number[]>([]),
  ]);
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Knockout bracket</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Most likely team in each slot, with its probability. Resolved teams shown in bold; 🎟️ marks matches you have
          tickets to. Scroll horizontally to follow the path to the final.
        </p>
      </div>
      <Bracket matches={data.matches} myMatchNumbers={myMatchNumbers} />
      <div className="border-border bg-card mt-6 rounded-xl border p-4">
        <h2 className="mb-1 text-sm font-semibold">Third-place play-off</h2>
        <ThirdPlace matches={data.matches} />
      </div>
    </main>
  );
}

function ThirdPlace({ matches }: { matches: { match: number; projHome?: { name: string }[]; projAway?: { name: string }[] }[] }) {
  const m = matches.find((x) => x.match === 103);
  if (!m) return null;
  return (
    <p className="text-muted-foreground text-sm">
      {m.projHome?.[0]?.name ?? "TBD"} vs {m.projAway?.[0]?.name ?? "TBD"} · Miami, Jul 18
    </p>
  );
}
