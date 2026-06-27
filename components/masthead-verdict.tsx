import Link from "next/link";
import { Flag } from "@/components/flag";
import { forecastPct } from "@/lib/format";
import { teamSlug } from "@/lib/slug";
import { getT, getLocale, getIntlLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import type { TeamPrediction } from "@/lib/predictions";

// The masthead: the model's single pick to win it all, stated as a confident editorial CALL (never
// definitive — it's a forecast). The hierarchy fix — the most-important insight is the largest thing on the
// page. Guards the near-flat title race with a "too close to call" top-3 variant so it never overstates.
export async function MastheadVerdict({ teams, iterations }: { teams: TeamPrediction[]; iterations: number }) {
  const t = await getT();
  const locale = await getLocale();
  const intl = await getIntlLocale();
  const [c1, c2] = teams;
  if (!c1) return null;
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
                <Link href={localeHref(locale, `/team/${teamSlug(tm.name)}`)} className={`hover:underline ${i === 0 ? "font-semibold" : ""}`}>{tm.name}</Link>
                <span className={`font-mono text-base tabular-nums ${i === 0 ? "text-primary" : "text-muted-foreground"}`}>{forecastPct(tm.title)}</span>
              </span>
            ))}
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            <Link href={localeHref(locale, `/team/${teamSlug(c1.name)}`)} className="decoration-primary/40 underline-offset-4 hover:underline">{c1.name}</Link>{" "}
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
