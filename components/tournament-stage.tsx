import { Fragment } from "react";
import { LocalTime } from "@/components/local-time";
import { getT } from "@/lib/i18n/server";
import type { MatchInfo } from "@/lib/predictions";

// A glance at where the whole tournament is: a phase tracker (Group → R32 → … → Final) with the current
// stage lit, plus a one-line context (matchday / round progress / what's next). Gives the homepage its
// "snapshot of the entire tournament" without a chart.
// Phase short labels reuse the shared rounds.* keys; GROUP's short label is home.stageGroupShort. The
// long name for the context line reuses rounds.GROUP/R32/… directly.
const PHASES = [
  { key: "GROUP", labelKey: "home.stageGroupShort", fullKey: "rounds.GROUP", total: 16 },
  { key: "R32", labelKey: "rounds.shortR32", fullKey: "rounds.R32", total: 16 },
  { key: "R16", labelKey: "rounds.shortR16", fullKey: "rounds.R16", total: 8 },
  { key: "QF", labelKey: "rounds.shortQF", fullKey: "rounds.QF", total: 4 },
  { key: "SF", labelKey: "rounds.shortSF", fullKey: "rounds.SF", total: 2 },
  { key: "FINAL", labelKey: "rounds.shortFinal", fullKey: "rounds.FINAL", total: 1 },
] as const;

export async function TournamentStage({
  matches, matchesPlayed, totalGroupMatches, className = "",
}: { matches: MatchInfo[]; matchesPlayed: number; totalGroupMatches: number; className?: string }) {
  const t = await getT();
  const playedIn = (round: string) => matches.filter((m) => m.round === round && m.status === "final").length;
  const phases = PHASES.map((p) => {
    const total = p.key === "GROUP" ? totalGroupMatches : p.total;
    const played = p.key === "GROUP" ? matchesPlayed : playedIn(p.key);
    return { ...p, total, played, done: played >= total };
  });
  const firstUndone = phases.findIndex((p) => !p.done);
  const cur = firstUndone === -1 ? phases.length - 1 : firstUndone;
  const curPhase = phases[cur];

  // Tournament over: a terminal "champions" line instead of a "what's next" that has no next.
  const finalM = matches.find((m) => m.round === "FINAL");
  const champion = finalM?.status === "final" && finalM.winner ? (finalM.winner === finalM.home ? finalM.homeName : finalM.awayName) : null;

  let context: React.ReactNode;
  if (champion) {
    context = t("home.stageChampions", { team: champion });
  } else if (curPhase.key === "GROUP") {
    const matchday = Math.min(3, Math.max(1, Math.ceil(matchesPlayed / 24))); // 24 group matches per matchday
    const firstR32 = matches.filter((m) => m.round === "R32").sort((a, b) => a.utc.localeCompare(b.utc))[0];
    context = (
      <>{t("home.stageGroupContext", { matchday, played: matchesPlayed, total: totalGroupMatches })}{firstR32 && <> · {t("home.knockoutsBegin")} <LocalTime utc={firstR32.utc} mode="day" /></>}</>
    );
  } else {
    const next = matches.filter((m) => m.round === curPhase.key && m.status !== "final").sort((a, b) => a.utc.localeCompare(b.utc))[0];
    context = (
      <>{t("home.stageKnockoutContext", { round: t(curPhase.fullKey), played: curPhase.played, total: curPhase.total })}{next && <> · {t("home.stageNext")} <LocalTime utc={next.utc} mode="day" /></>}</>
    );
  }

  // A full-width strip: the phase tracker on the left, the live context on the right (md+). Stacks on mobile.
  // Full-width (rather than a narrow aside tile) so it reads as a tournament-wide progress bar and leaves no gap.
  return (
    <div className={`border-border bg-card flex flex-col gap-2 rounded-2xl border px-4 py-3 md:flex-row md:items-center md:justify-between md:gap-6 ${className}`}>
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,#000_1.25rem,#000_calc(100%-1.25rem),transparent)] md:shrink-0 md:[mask-image:none]">
        {phases.map((p, i) => (
          <Fragment key={p.key}>
            <span className={`font-mono text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase ${i === cur ? "text-primary" : p.done ? "text-muted-foreground" : "text-muted-2"}`}>
              {t(p.labelKey)}
            </span>
            {i < phases.length - 1 && <span className={`h-px w-5 shrink-0 ${p.done ? "bg-primary/40" : "bg-border"}`} />}
          </Fragment>
        ))}
      </div>
      <p className="text-muted-2 text-xs md:text-right" suppressHydrationWarning>{context}</p>
    </div>
  );
}
