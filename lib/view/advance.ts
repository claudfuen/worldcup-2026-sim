import type { GroupTeamView } from "@/lib/predictions";
import { forecastPct } from "@/lib/format";
import type { AdvanceDisplay, Tone } from "./types";

// The ONE definition of "this team has mathematically locked a Round-of-32 place" - the three clinch
// statuses. Any surface that needs the boolean (e.g. the homepage funnel's ✓) calls this instead of
// re-listing the statuses inline, so the ladder lives in exactly one place.
export function clinchesR32(status: GroupTeamView["status"]): boolean {
  return status === "won_group" || status === "second" || status === "advanced";
}

// THE single mapping from a group row's clinch status -> how its advancement renders. Every
// standings/advance surface calls this; none re-derives the ladder. `rank` is the 0-based finishing
// position in the (already-ranked) group, used only to tone a non-clinched forecast.
export function teamAdvanceDisplay(row: GroupTeamView, rank: number): AdvanceDisplay {
  switch (row.status) {
    case "won_group":
      return { kind: "wonGroup", symbol: "👑", label: "✓ 1st", tone: "win" };
    case "second":
      return { kind: "runnerUp", symbol: "✓", label: "✓ 2nd", tone: "win" };
    case "advanced":
      return { kind: "advanced", symbol: "✓", label: "✓ in", tone: "win" };
    case "eliminated":
      return { kind: "eliminated", symbol: null, label: "out", tone: "eliminated" };
    default: {
      const tone: Tone = rank <= 1 ? "win" : rank === 2 ? "contention" : "muted";
      return { kind: "forecast", symbol: null, pct: forecastPct(row.advance), tone, delta: row.advanceDelta };
    }
  }
}
