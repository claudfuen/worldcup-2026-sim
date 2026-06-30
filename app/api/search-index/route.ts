import { NextResponse } from "next/server";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive } from "@/lib/live";
import { playerUniverse, playerSlug } from "@/lib/players";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compact index for the ⌘K command palette, fetched lazily on first open. Returns CODES only (the client
// localizes names) so it stays tiny: matches (resolved participants + top projected candidates so unresolved
// knockout ties are searchable by their EXPECTED matchups) and players (everyone with a tally). Match list is
// overlaid with the live feed so a just-finished knockout shows its real teams immediately.
export async function GET() {
  try {
    const data = await getPredictions();
    let matches = data.matches;
    try {
      matches = overlayLive(data.matches, await getLiveMatches());
    } catch {
      /* live feed down — use the cached payload */
    }
    const out = matches.map((m) => ({
      n: m.match,
      round: m.round,
      utc: m.utc,
      city: m.city,
      venue: m.venue,
      group: m.group ?? null,
      status: m.status,
      h: m.home,
      a: m.away,
      ph: (m.projHome ?? []).slice(0, 3).map((c) => c.code),
      pa: (m.projAway ?? []).slice(0, 3).map((c) => c.code),
    }));
    const posByKey = new Map((data.awards.players ?? []).map((p) => [`${p.name}|${p.teamCode}`, p.position]));
    const players = playerUniverse(data.awards).map((p) => ({ name: p.player, team: p.teamCode, slug: p.slug, pos: posByKey.get(`${p.player}|${p.teamCode}`) ?? "" }));
    // "Most-likely-searched" entities for the empty state: title favorites + the top scorers.
    const suggest = {
      teams: data.teams.slice(0, 6).map((tm) => tm.code),
      players: data.awards.goldenBoot.filter((e) => e.goals > 0).slice(0, 6).map((e) => playerSlug(e.player, e.teamCode)),
    };
    return NextResponse.json({ matches: out, players, suggest }, { headers: { "cache-control": "public, max-age=60" } });
  } catch {
    return NextResponse.json({ matches: [], players: [], suggest: { teams: [], players: [] } });
  }
}
