import type { AdvanceDisplay } from "@/lib/view/types";
import { TONE_CLASS } from "@/lib/view/types";
import { Delta } from "@/components/delta";
import { getT } from "@/lib/i18n/server";

// Renders a team's advancement from the AdvanceDisplay union. `full` shows the label ("✓ 1st"),
// `compact` shows just the symbol (👑/✓) for tight spaces. The forecast arm is the ONLY one that
// renders a percentage - the clinched/eliminated arms have no number to print.
export async function AdvanceBadge({
  d,
  variant = "full",
  showDelta = false,
}: {
  d: AdvanceDisplay;
  variant?: "full" | "compact";
  showDelta?: boolean;
}) {
  const t = await getT();
  const SR: Record<Exclude<AdvanceDisplay["kind"], "forecast">, string> = {
    wonGroup: t("groups.srBadgeWonGroup"),
    runnerUp: t("groups.srBadgeRunnerUp"),
    advanced: t("groups.srBadgeQualified"),
    eliminated: t("groups.srBadgeEliminated"),
  };
  if (d.kind === "forecast") {
    return (
      <span className={`font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${TONE_CLASS[d.tone]}`}>
        {d.pct}
        {showDelta ? <Delta v={d.delta} /> : null}
      </span>
    );
  }
  const text = variant === "compact" ? (d.symbol ?? d.label) : d.label;
  return (
    <span className={`font-semibold whitespace-nowrap ${variant === "full" ? "font-mono text-xs" : ""} ${TONE_CLASS[d.tone]}`}>
      {text}
      <span className="sr-only"> {SR[d.kind]}</span>
    </span>
  );
}
