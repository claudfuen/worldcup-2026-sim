import Link from "next/link";
import type { MatchInfo, TeamPrediction, GroupView } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { computeWatchability, CERTAINISH, type WatchPick } from "@/lib/watchability";
import { getT, getLocale, type TFunction } from "@/lib/i18n/server";
import { localeHref, type Locale } from "@/lib/i18n/config";

// "Matches to watch" — the curated watch plan. The appeal model now lives in lib/watchability.ts (shared
// with the cross-cutting "hot match" badge), so the plan here and the badges elsewhere always agree: the
// hot picks ARE the plan. Cards show the soonest-first hot matches with a short "why".
// Round short-labels reuse the shared rounds.* keys ("3P" → rounds.shortThird).
const ROUND_SHORT_KEY: Record<string, string> = {
  R32: "rounds.shortR32",
  R16: "rounds.shortR16",
  QF: "rounds.shortQF",
  SF: "rounds.shortSF",
  FINAL: "rounds.shortFinal",
  "3P": "rounds.shortThird",
};

// Beyond ~36h out, so this plan complements (not duplicates) the live rail's today/tomorrow slate. Kept out
// of the component body so the render stays pure (Date.now() belongs in a helper).
function isFarOut(utc: string): boolean {
  return Date.parse(utc) - Date.now() > 36 * 3_600_000;
}

function TeamLine({ code, name, dim, tbd }: { code: string | null; name: string | null; dim?: boolean; tbd: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Flag code={code} size={18} />
      <span className={`min-w-0 flex-1 truncate text-sm font-medium ${dim ? "text-foreground/85" : ""}`}>{name ?? tbd}</span>
    </div>
  );
}

export async function MatchesToWatch({
  matches, teams, groups = [], className = "",
}: { matches: MatchInfo[]; teams: TeamPrediction[]; groups?: GroupView[]; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const { picks } = computeWatchability(matches, teams, groups);
  // Only carry games BEYOND the next day or so — the live rail already leads with today/tomorrow (with the
  // same hot badges), so this section is the forward-looking plan, not a duplicate of what's imminent.
  const plan = picks
    .filter((p) => p.hot && isFarOut(p.match.utc))
    .sort((a, b) => a.match.utc.localeCompare(b.match.utc));
  if (plan.length === 0) return null;

  return (
    <section className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">{t("home.watchHeading")}</h2>
        <Link href={localeHref(locale, "/schedule")} className="text-primary text-xs hover:underline">{t("home.fullSchedule")}</Link>
      </div>
      <p className="text-muted-2 mb-3 text-xs text-pretty">{t("home.watchLede")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plan.map((p) => <WatchCard key={p.match.match} p={p} t={t} locale={locale} />)}
      </div>
    </section>
  );
}

function WatchCard({ p, t, locale }: { p: WatchPick; t: TFunction; locale: Locale }) {
  const m = p.match;
  const projected = !p.defined && p.lik < CERTAINISH;
  const reason = t(p.reason.key, p.reason.params);
  const note = projected ? t("home.watchProjectedNote", { pct: Math.max(1, Math.round(p.lik * 100)), reason }) : reason;
  const roundLabel =
    m.round === "GROUP"
      ? t("home.groupShort", { group: m.group ?? "" })
      : projected
        ? t("home.roundProjected", { round: t(ROUND_SHORT_KEY[m.round] ?? "") })
        : t(ROUND_SHORT_KEY[m.round] ?? "");
  return (
    <Link
      href={localeHref(locale, `/match/${m.match}`)}
      className={`bg-card hover:border-primary/50 hover:bg-surface-raised flex flex-col rounded-xl border p-4 transition-colors ${projected ? "border-border/70 border-dashed" : "border-border"}`}
    >
      <div className="text-muted-foreground mb-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate font-mono" suppressHydrationWarning><LocalTime utc={m.utc} mode="day" /> · <LocalTime utc={m.utc} mode="timeshort" /></span>
        <span className={`shrink-0 font-mono text-[10px] tracking-wide uppercase ${projected ? "text-primary/80" : "text-muted-2"}`}>
          {roundLabel}
        </span>
      </div>
      <TeamLine code={p.home} name={p.homeName} dim={projected} tbd={t("common.tbd")} />
      <TeamLine code={p.away} name={p.awayName} dim={projected} tbd={t("common.tbd")} />
      <div className="text-muted-foreground mt-2 line-clamp-2 text-xs">{note}</div>
    </Link>
  );
}
