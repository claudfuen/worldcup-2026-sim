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

  // Overall tournament completion — every match, not just the current phase. Counted off the live-overlaid
  // matches array so finals land here the moment they finish, ahead of the cron recompute.
  const totalMatches = matches.length;
  const playedMatches = matches.filter((m) => m.status === "final").length;
  const pct = totalMatches ? Math.round((playedMatches / totalMatches) * 100) : 0;

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

  // A full-width strip: the phase tracker + live context up top, an overall-completion progress bar beneath.
  // Not a card — it blends into the masthead as a header utility bar, set off by a single hairline rule and
  // aligned flush with the headline so it reads as part of "the model's call", not a separate boxed widget.
  return (
    <div className={`border-border/60 flex flex-col gap-3 border-t pt-5 ${className}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6">
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

      {/* Overall completion — how far through the whole 104-match tournament we are. */}
      <div className="flex items-center gap-3">
        <div
          className="bg-muted/40 relative h-1.5 flex-1 overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t("home.tournamentProgressLabel")}
        >
          <div className="bg-primary absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-muted-2 shrink-0 font-mono text-[10px] font-semibold tabular-nums whitespace-nowrap">
          {t("home.tournamentProgress", { pct, played: playedMatches, total: totalMatches })}
        </span>
      </div>
    </div>
  );
}
