import Link from "next/link";
import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import type { AwardEntry } from "@/lib/awards";
import { getT, getLocale, type TFunction } from "@/lib/i18n/server";
import { localeHref, type Locale } from "@/lib/i18n/config";

// Two accents give each race its own identity without leaving the palette: the Golden Boot is gold (the
// existing --contention amber), assists are the cool data-blue. Classes are static so Tailwind keeps them.
type Accent = "gold" | "cool";
const ACCENT: Record<Accent, { text: string; solid: string; ghost: string; glow: string }> = {
  gold: { text: "text-contention", solid: "bg-contention", ghost: "bg-contention/25", glow: "from-contention/[0.08]" },
  cool: { text: "text-data-cool", solid: "bg-data-cool", ghost: "bg-data-cool/25", glow: "from-data-cool/[0.08]" },
};

// "Where it finishes": a single bar reads current → projected. The solid segment is the tally NOW, the
// ghosted segment is the model's projected gain over the team's remaining matches; both scaled to the board's
// projected leader, so bar length is comparable down the list and the leader's bar runs nearly full.
function ProjBar({ current, projected, max, accent, className = "" }: { current: number; projected: number; max: number; accent: Accent; className?: string }) {
  const a = ACCENT[accent];
  const cur = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const gain = max > 0 ? Math.min(100 - cur, (Math.max(0, projected - current) / max) * 100) : 0;
  return (
    <div className={`bg-muted/40 flex overflow-hidden rounded-full dark:inset-ring dark:inset-ring-white/5 ${className}`} aria-hidden>
      <div className={`${a.solid} h-full`} style={{ width: `${cur}%` }} />
      <div className={`${a.ghost} h-full`} style={{ width: `${gain}%` }} />
    </div>
  );
}

// One awards leaderboard (Golden Boot or assists): a featured leader card carrying the story, then a ranked
// list. Each shows current tally → projected finish (the bar) and P(win). Player names are proper nouns (not
// localized); the team name is. Rows link to the scorer's team. Mobile keeps tally + forecast bar + win%.
export async function AwardsBoard({ entries, metric, accent, limit = 20 }: { entries: AwardEntry[]; metric: "goals" | "assists"; accent: Accent; limit?: number }) {
  const t = await getT();
  const locale = await getLocale();
  const rows = entries.slice(0, limit);
  if (rows.length === 0) return <p className="text-muted-2 border-border bg-card rounded-2xl border px-4 py-6 text-center text-sm dark:inset-ring dark:inset-ring-white/5">{t("awards.boardEmpty")}</p>;
  const max = Math.max(...rows.map((e) => e.projected), 1);
  const [leader, ...rest] = rows;
  return (
    <div>
      <FeaturedLeader entry={leader} metric={metric} accent={accent} max={max} t={t} locale={locale} />
      {rest.length > 0 && (
        <div className="border-border bg-card mt-3 rounded-2xl border p-1.5 dark:inset-ring dark:inset-ring-white/5">
          <ol start={2} className="divide-border/50 list-none divide-y">
            {rest.map((e, i) => (
              <Row key={`${e.player}-${e.teamCode}`} entry={e} rank={i + 2} metric={metric} accent={accent} max={max} t={t} locale={locale} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function valueOf(e: AwardEntry, metric: "goals" | "assists") {
  return metric === "goals" ? e.goals : e.assists;
}

function FeaturedLeader({ entry, metric, accent, max, t, locale }: { entry: AwardEntry; metric: "goals" | "assists"; accent: Accent; max: number; t: TFunction; locale: Locale }) {
  const a = ACCENT[accent];
  const value = valueOf(entry, metric);
  const unit = metric === "goals" ? t("awards.goalsAbbr") : t("awards.assistsAbbr");
  const left = Math.round(entry.matchesLeft);
  return (
    <Link
      href={localeHref(locale, `/team/${slugForCode(entry.teamCode)}`)}
      className="group border-border bg-card relative block overflow-hidden rounded-2xl border p-4 transition-colors sm:p-5 dark:inset-ring dark:inset-ring-white/5"
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${a.glow} to-40% to-transparent`} aria-hidden />
      <div className="relative flex items-start gap-3 sm:gap-4">
        <span className="shrink-0"><Flag code={entry.teamCode} size={44} /></span>
        <div className="min-w-0 flex-1">
          <div className={`font-mono text-[10px] font-semibold tracking-[0.12em] uppercase ${a.text}`}>{t("awards.leaderLabel")}</div>
          <div className="font-display group-hover:text-foreground/90 mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{entry.player}</div>
          <div className="text-muted-2 mt-0.5 truncate text-xs">
            {t(`teams.${entry.teamCode}`)}
            {left > 0 && <> · {t("awards.matchesLeftFull", { n: left })}</>}
            {metric === "goals" && entry.penalties > 0 && <> · {t("awards.penNote", { n: entry.penalties })}</>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {entry.clinched ? (
            <div className={`inline-flex items-center gap-1.5 font-mono text-xl font-semibold tracking-[0.08em] uppercase sm:text-2xl ${a.text}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5 10 17.5 19 7" /></svg>
              {t("awards.wonUpper")}
            </div>
          ) : (
            <>
              <div className={`font-mono text-3xl leading-none font-semibold tabular-nums sm:text-4xl ${a.text}`}>{forecastPct(entry.winProb)}</div>
              <div className="text-muted-2 mt-1 font-mono text-[10px] tracking-wide uppercase">{t("awards.toWin")}</div>
            </>
          )}
        </div>
      </div>
      <div className="relative mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span>
            <span className="text-muted-2 font-mono text-[10px] tracking-wide uppercase">{t("awards.now")} </span>
            <span className="font-mono text-base font-semibold tabular-nums">{value}</span>
            <span className="text-muted-2"> {unit}</span>
          </span>
          <span>
            <span className="text-muted-2 font-mono text-[10px] tracking-wide uppercase">{t("awards.proj")} </span>
            <span className={`font-mono text-base font-semibold tabular-nums ${a.text}`}>{entry.projected.toFixed(1)}</span>
          </span>
        </div>
        <ProjBar current={value} projected={entry.projected} max={max} accent={accent} className="h-2.5" />
      </div>
    </Link>
  );
}

function Row({ entry, rank, metric, accent, max, t, locale }: { entry: AwardEntry; rank: number; metric: "goals" | "assists"; accent: Accent; max: number; t: TFunction; locale: Locale }) {
  const value = valueOf(entry, metric);
  const unit = metric === "goals" ? t("awards.colGoals") : t("awards.colAssists");
  return (
    <li>
      <Link
        href={localeHref(locale, `/team/${slugForCode(entry.teamCode)}`)}
        className={`hover:bg-muted/20 flex items-center gap-2.5 rounded-md px-1.5 py-2.5 transition-colors ${entry.eliminated ? "opacity-55" : ""}`}
      >
        <span className="text-muted-2 w-5 shrink-0 text-right font-mono text-xs tabular-nums">{rank}</span>
        <Flag code={entry.teamCode} size={20} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{entry.player}</div>
          <div className="text-muted-2 truncate text-xs">
            {t(`teams.${entry.teamCode}`)}
            {metric === "goals" && entry.penalties > 0 && <span> · {t("awards.penNote", { n: entry.penalties })}</span>}
          </div>
        </div>
        {/* current tally */}
        <div className="w-6 shrink-0 text-right font-mono text-base font-semibold tabular-nums">
          {value}<span className="sr-only"> {unit}</span>
        </div>
        {entry.eliminated ? (
          // Definitive "out": team has no matches left and is already behind the leader — a fixed tally that
          // someone has already beaten. Show the certainty, not a 0% probability.
          <div className="flex w-[5.5rem] shrink-0 justify-end sm:w-32" title={t("awards.outTitle")}>
            <span className="text-muted-2 font-mono text-[11px] tracking-wide uppercase">{t("awards.out")}</span>
          </div>
        ) : (
          // current → projected bar + projected number (the forecast, kept on mobile too)
          <div className="flex w-[5.5rem] shrink-0 items-center gap-1.5 sm:w-32">
            <ProjBar current={value} projected={entry.projected} max={max} accent={accent} className="h-1.5 flex-1" />
            <span className="text-muted-2 w-7 shrink-0 text-right font-mono text-[11px] tabular-nums">
              {entry.projected.toFixed(1)}<span className="sr-only"> {t("awards.projected")}</span>
            </span>
          </div>
        )}
        {/* P(win), "won" when clinched, or a dash when out */}
        <span className="w-9 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">
          {entry.clinched ? (
            <span className={ACCENT[accent].text}>{t("awards.won")}</span>
          ) : entry.eliminated ? (
            <span className="text-muted-2" aria-hidden>—</span>
          ) : (
            <>{forecastPct(entry.winProb)}<span className="sr-only"> {t("awards.chance")}</span></>
          )}
        </span>
      </Link>
    </li>
  );
}
