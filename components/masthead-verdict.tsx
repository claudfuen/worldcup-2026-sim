import Link from "next/link";
import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import { getT, getLocale, getIntlLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import type { TeamPrediction } from "@/lib/predictions";

// The masthead: the model's single pick to win it all, stated as a confident editorial CALL (never
// definitive — it's a forecast). The hierarchy fix — the most-important insight is the largest thing on the
// page. Guards the near-flat title race with a "too close to call" top-3 variant so it never overstates.
export async function MastheadVerdict({ teams, iterations, complete, champion }: { teams: TeamPrediction[]; iterations: number; complete?: boolean; champion?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const intl = await getIntlLocale();
  const [c1, c2] = teams;
  if (!c1) return null;

  // Tournament over: crown the actual champion (a settled fact, not a forecast — no probability).
  const champ = complete && champion ? teams.find((tm) => tm.code === champion) : undefined;
  if (champ) {
    return (
      <div>
        <div className="text-contention font-mono text-xs font-semibold tracking-wide uppercase">{t("home.championEyebrow")}</div>
        <h1 className="mt-2 flex items-center gap-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          <TrophyIcon />
          <span>
            <Link href={localeHref(locale, `/team/${slugForCode(champ.code)}`)} className="decoration-contention/40 underline-offset-4 hover:underline">{champ.name}</Link>{" "}
            <span className="text-muted-foreground font-normal">{t("home.areChampions")}</span>
          </span>
        </h1>
        <div className="mt-3 flex items-center gap-2.5">
          <Flag code={champ.code} size={22} />
          <span className="text-muted-foreground text-sm">{t("home.championLine")}</span>
        </div>
      </div>
    );
  }

  const close = c2 != null && c1.title - c2.title < 0.02;
  const top = [teams[0], teams[1], teams[2]].filter((t): t is TeamPrediction => Boolean(t));

  return (
    <div>
      <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("home.modelsCall")}</div>
      {close ? (
        <>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("home.tooCloseToCall")}</h1>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-lg">
            {top.map((tm, i) => (
              <span key={tm.code} className="inline-flex items-baseline gap-1.5">
                <Link href={localeHref(locale, `/team/${slugForCode(tm.code)}`)} className={`hover:underline ${i === 0 ? "font-semibold" : ""}`}>{tm.name}</Link>
                <span className={`font-mono text-base tabular-nums ${i === 0 ? "text-primary" : "text-muted-foreground"}`}>{forecastPct(tm.title)}</span>
              </span>
            ))}
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            <Link href={localeHref(locale, `/team/${slugForCode(c1.code)}`)} className="decoration-primary/40 underline-offset-4 hover:underline">{c1.name}</Link>{" "}
            <span className="text-muted-foreground font-normal">{t("home.toWinItAll")}</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Flag code={c1.code} size={22} />
            <span className="text-primary font-mono text-2xl font-semibold tabular-nums sm:text-3xl">{forecastPct(c1.title)}</span>
            <span className="text-muted-foreground text-sm">{t("home.toLiftTheTrophy")}</span>
          </div>
        </>
      )}
      <p className="text-muted-foreground mt-3 text-sm text-pretty">
        {t("home.simsTagline", { count: iterations.toLocaleString(intl) })}
      </p>
    </div>
  );
}

// Gold trophy for the champion crown.
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-contention shrink-0" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}
