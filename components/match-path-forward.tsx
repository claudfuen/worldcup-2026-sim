import Link from "next/link";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { forecastPct } from "@/lib/format";
import { fifaCity } from "@/lib/venues";
import type { MatchInfo } from "@/lib/predictions";
import { matchForwardPath, type MatchPathStep } from "@/lib/matchPath";
import { type PathRound } from "@/lib/teamPath";
import { getT, getLocale } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// The winner of THIS knockout tie's road to the final: who they'd face at each round going forward. Mirrors
// the team-page road-to-final (lead opponent emphasised, alternatives muted) but anchored at this match, so
// it reads even before either side is known. Hidden for group matches, the final, and the third-place tie.

const SHORT: Record<PathRound, string> = {
  R32: "rounds.shortR32", R16: "rounds.shortR16", QF: "rounds.shortQF", SF: "rounds.shortSF", FINAL: "rounds.shortFinal",
};

function nm(t: TFunction, code: string | null): string | null {
  return code ? t(`teams.${code}`) : null;
}

export async function MatchPathForward({ m, matches }: { m: MatchInfo; matches: MatchInfo[] }) {
  const t = await getT();
  const locale = await getLocale();
  const steps = matchForwardPath(matches, m);
  if (steps.length === 0) return null; // group match / final / third-place — no onward winner path

  // Context lede: name the actual winner once known, else frame it as the winner's hypothetical path.
  const winnerName = m.status === "final" && m.winner ? nm(t, m.winner) : null;
  const lede = winnerName ? t("match.forwardLedeWinner", { team: winnerName }) : t("match.forwardLede");

  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.forwardHeading")}</h2>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        {steps.map((s) => (
          <Link key={s.round} href={localeHref(locale, `/match/${s.match.match}`)} className="hover:bg-muted/20 flex items-center gap-3 px-4 py-3 transition-colors">
            <span className="bg-muted/40 text-muted-foreground w-11 shrink-0 rounded-md py-0.5 text-center font-mono text-[10px] font-semibold tracking-wide uppercase">{t(SHORT[s.round])}</span>
            <div className="min-w-0 flex-1">
              <Opponent s={s} t={t} />
              <div className="text-muted-2 mt-0.5 truncate text-[10px]" suppressHydrationWarning>
                M{s.match.match} · <LocalTime utc={s.match.utc} mode="day" /> · {fifaCity(s.match.venue, s.match.city)}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <p className="text-muted-2 mt-2 text-xs text-pretty">{lede}</p>
    </section>
  );
}

function Opponent({ s, t }: { s: MatchPathStep; t: TFunction }) {
  if (s.oppLocked) {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-2 shrink-0 text-xs">{t("common.vs")}</span>
        <Flag code={s.oppLocked.code} size={16} />
        <span className="min-w-0 truncate font-semibold">{s.oppLocked.name}</span>
      </div>
    );
  }
  const [lead, ...alts] = s.oppCandidates;
  if (!lead) return <div className="text-muted-2 text-sm">{t("common.vs")} {t("common.tbd")}</div>;
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-2 shrink-0 text-xs">{t("common.vs")}</span>
        <Flag code={lead.code} size={16} />
        <span className="min-w-0 truncate font-semibold">{lead.name}</span>
        <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">{forecastPct(lead.prob)}</span>
      </div>
      {alts.length > 0 && (
        <div className="text-muted-2 mt-0.5 truncate text-[11px]">
          {t("team.pathOr")} {alts.map((a) => `${a.name} ${forecastPct(a.prob)}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
