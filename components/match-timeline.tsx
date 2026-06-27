import { Flag } from "@/components/flag";
import { getT, type TFunction } from "@/lib/i18n/server";
import type { MatchEvent } from "@/lib/matchEvents";

// The match's goals / cards / substitutions as a centered timeline: a vertical spine carries the minute and
// the running score, with each event on its own team's side (home left, away right). Team headers anchor the
// sides so it's unambiguous, and proper icons make each event type read at a glance. Live + completed; nothing
// when there are no events.
export async function MatchTimeline({
  events, homeCode, awayCode, homeName, awayName,
}: {
  events: MatchEvent[];
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
}) {
  const t = await getT();
  if (!events.length) return null;

  // Running score after each goal (own goals count for the opponent).
  let h = 0, a = 0;
  const rows = events.map((e) => {
    const beneficiary = e.kind === "goal" && e.goalType === "own" ? (e.teamCode === homeCode ? awayCode : homeCode) : e.teamCode;
    let score: string | null = null;
    if (e.kind === "goal") {
      if (beneficiary === homeCode) h++;
      else if (beneficiary === awayCode) a++;
      score = `${h}–${a}`;
    }
    const onHome = beneficiary === homeCode;
    return { e, score, onHome };
  });

  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.timeline")}</h2>
      <div className="border-border bg-card rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5 sm:p-5">
        {/* Side anchors */}
        <div className="text-foreground/80 mb-1 flex items-center justify-between gap-2 text-xs font-medium">
          <span className="flex min-w-0 items-center gap-1.5"><Flag code={homeCode} size={16} /><span className="truncate">{homeName}</span></span>
          <span className="flex min-w-0 flex-row-reverse items-center gap-1.5"><Flag code={awayCode} size={16} /><span className="truncate">{awayName}</span></span>
        </div>

        {/* Timeline with a center spine */}
        <ol className="relative mt-2">
          <div className="bg-border/70 absolute inset-y-0 left-1/2 w-px -translate-x-1/2" aria-hidden />
          {rows.map(({ e, score, onHome }, i) => (
            <li key={i} className="grid grid-cols-[1fr_3rem_1fr] items-center gap-2 py-2 sm:grid-cols-[1fr_3.5rem_1fr] sm:gap-3">
              <div className="flex justify-end">{onHome && <Event e={e} side="home" t={t} />}</div>
              {/* Spine node: minute, and the running score at goal moments */}
              <div className="bg-card relative z-10 flex flex-col items-center gap-1 py-0.5">
                <span className="text-muted-2 font-mono text-[10px] tabular-nums whitespace-nowrap">{e.minute}</span>
                {score ? (
                  <span className="border-border-strong bg-surface-raised text-foreground rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums">{score}</span>
                ) : (
                  <span className="bg-border size-1.5 rounded-full" aria-hidden />
                )}
              </div>
              <div className="flex justify-start">{!onHome && <Event e={e} side="away" t={t} />}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Event({ e, side, t }: { e: MatchEvent; side: "home" | "away"; t: TFunction }) {
  const home = side === "home";
  const tag = e.goalType === "penalty" ? t("match.penaltyTag") : e.goalType === "own" ? t("match.ownGoalTag") : null;
  const icon =
    e.kind === "goal" ? (
      <GoalIcon label={t("match.goalLabel")} />
    ) : e.kind === "card" ? (
      <span
        className={`h-3.5 w-2.5 rounded-[2px] ${e.card === "red" ? "bg-[#dc2626]" : "bg-[#eab308]"}`}
        role="img"
        aria-label={e.card === "red" ? t("match.redCardLabel") : t("match.yellowCardLabel")}
      />
    ) : (
      <SubIcon label={t("match.subLabel")} />
    );
  return (
    <div className={`flex min-w-0 items-start gap-2 ${home ? "flex-row" : "flex-row-reverse"}`}>
      <div className={`min-w-0 ${home ? "text-right" : "text-left"}`}>
        <div className="truncate text-sm">
          <span className={e.kind === "goal" ? "font-semibold" : "text-foreground/90"}>{e.player}</span>
          {tag && <span className="text-muted-2 ms-1 font-mono text-[10px] tracking-wide uppercase">({tag})</span>}
        </div>
        {e.assist && <div className="text-muted-2 truncate text-[11px]">{t("match.assist", { name: e.assist })}</div>}
        {e.playerOff && <div className="text-muted-2 truncate text-[11px]">{t("match.subOff", { name: e.playerOff })}</div>}
      </div>
      <span className="mt-0.5 flex w-4 shrink-0 justify-center">{icon}</span>
    </div>
  );
}

// A pitch-green soccer ball — the universal "goal" mark.
function GoalIcon({ label }: { label: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-primary" role="img" aria-label={label}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8.2l3.8 2.76-1.45 4.47h-4.7L8.2 10.96z" fill="currentColor" />
      <path
        d="M12 8.2V3.5M15.8 10.96l4.2-1.5M14.35 15.43l3 3.1M9.65 15.43l-3 3.1M8.2 10.96l-4.2-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Substitution: a green arrow on (up) and a muted arrow off (down).
function SubIcon({ label }: { label: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
      <path d="M8 20V6m0 0L5 9m3-3 3 3" className="stroke-win" />
      <path d="M16 4v14m0 0-3-3m3 3 3-3" className="stroke-muted-foreground" />
    </svg>
  );
}
