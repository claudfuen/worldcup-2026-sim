import type { MatchInfo } from "@/lib/predictions";

// One coherent story across every projection surface: the "projected champion" is argmax(title), so the
// projected BRACKET must contain that champion — otherwise the tree shows e.g. a France–Argentina final
// next to "Projected champion: Spain" (Spain reaches the final slightly less often than France, but wins
// it more often; both argmaxes are honest, the combination is incoherent).
//
// Fix: walk the champion's most-likely road from the FINAL down its W## feeder chain and move the champion
// to the FRONT of each unresolved slot's candidate list. Probabilities are NOT touched — each candidate
// keeps its true P(reach this slot) — only the canonical "projected occupant" (list[0], which every surface
// reads: bracket nodes, the projected-final header line, the homepage teaser, schedule/calendar rows)
// changes so the whole projected tree resolves to the projected champion.
//
// Mutates `matches` in place (payload post-processing, like the third-place filter). Resolved slots and
// played matches are left alone — the road only re-narrates the future, never history.
export function applyChampionRoad(matches: MatchInfo[], champion: string | undefined): void {
  if (!champion) return;
  const byMatch = new Map(matches.map((m) => [m.match, m]));
  let m = matches.find((x) => x.round === "FINAL");
  while (m) {
    // Which side of this match is the champion's? A resolved participant decides outright; otherwise the
    // side where the champion's reach probability is higher. A resolved non-champion side contributes 0.
    let side: "home" | "away";
    if (m.home === champion) side = "home";
    else if (m.away === champion) side = "away";
    else {
      const ph = m.home ? 0 : (m.projHome?.find((c) => c.code === champion)?.prob ?? 0);
      const pa = m.away ? 0 : (m.projAway?.find((c) => c.code === champion)?.prob ?? 0);
      if (ph === 0 && pa === 0) return; // champion absent from both slots (played out, or sliced away) — stop
      side = ph >= pa ? "home" : "away";
      const key = side === "home" ? "projHome" : "projAway";
      const list = m[key];
      const i = list ? list.findIndex((c) => c.code === champion) : -1;
      if (list && i > 0) m[key] = [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
    }
    if (m.status === "final") return; // this match is history — everything below it is too
    // Descend into the knockout feeder (W##) on the champion's side; group-slot refs (1X/2X/3:…) are the
    // R32 entry points — the end of the road.
    const slot = side === "home" ? m.slotHome : m.slotAway;
    m = slot?.startsWith("W") ? byMatch.get(Number(slot.slice(1))) : undefined;
  }
}
