import type { Metadata } from "next";
import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { Flag } from "@/components/flag";
import { Delta } from "@/components/delta";
import { RelatedLinks } from "@/components/related-links";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import { localizeTeams } from "@/lib/i18n/localize-payload";
import { getT, getLocale } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("titleRace.metaTitle");
  const data = await getPredictions().catch(() => null);
  const lead = data?.teams?.[0];
  const description = lead
    ? data?.complete
      ? t("titleRace.metaDescWon", { team: lead.name })
      : t("titleRace.metaDescLeader", { team: lead.name, pct: forecastPct(lead.title) })
    : t("titleRace.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/title-race", locale),
    openGraph: { title, description, url: localeHref(locale, "/title-race"), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TitleRacePage() {
  const t = await getT();
  const locale = await getLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const hasLive = liveActivity(data.matches, live);
  const teams = localizeTeams(data.teams, t);
  // Everyone still mathematically in it (champion prob > 0), ranked. Eliminated sides drop off.
  const contenders = teams.filter((tm) => tm.title > 0);
  const max = contenders[0]?.title || 1;
  const leader = contenders[0];
  const verdict = !leader
    ? t("titleRace.verdictNoData")
    : data.complete
      ? t("titleRace.verdictWon", { team: leader.name })
      : t("titleRace.verdictLeader", { team: leader.name, pct: forecastPct(leader.title) });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <header className="mb-6">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("titleRace.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{data.complete ? t("titleRace.headingFinal") : t("titleRace.heading")}</h1>
        <p className="text-foreground mt-2 text-base text-pretty">{verdict}</p>
        <p className="text-muted-2 mt-2 text-xs text-pretty">{t("titleRace.subhead", { iters: "20k" })}</p>
      </header>

      <ol className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        {contenders.map((tm, i) => (
          <li key={tm.code}>
            <Link href={localeHref(locale, `/team/${slugForCode(tm.code)}`)} className="hover:bg-muted/20 flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4">
              <span className="text-muted-2 w-5 shrink-0 text-right font-mono text-xs tabular-nums">{i + 1}</span>
              <Flag code={tm.code} size={22} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{tm.name}</span>
              {/* reach-final, secondary depth column (hidden on the smallest screens) */}
              <span className="text-muted-2 hidden w-24 shrink-0 text-right font-mono text-[11px] tabular-nums sm:inline">{forecastPct(tm.final)} {t("titleRace.toFinal")}</span>
              <span className="bg-muted/40 relative hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full sm:block lg:w-24 dark:inset-ring dark:inset-ring-white/5" aria-hidden>
                <span className="bg-primary/85 absolute inset-y-0 left-0 rounded-full" style={{ width: `${(tm.title / max) * 100}%` }} />
              </span>
              <span className="flex shrink-0 items-center justify-end font-mono text-sm font-semibold tabular-nums">
                <span className="w-9 text-right">{forecastPct(tm.title)}</span>
                <span className="w-7 text-left"><Delta v={tm.titleDelta} /></span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <p className="text-muted-2 mt-4 text-xs text-pretty">
        <span className="text-win">▲</span><span className="text-destructive">▼</span> {t("home.changeSinceStart")} · {t("titleRace.footnote")}
      </p>

      <RelatedLinks
        links={[
          { label: t("nav.bracket"), href: localeHref(locale, "/bracket") },
          { label: t("awards.viewFull"), href: localeHref(locale, "/awards") },
          { label: t("nav.overview"), href: localeHref(locale, "/") },
        ]}
      />
    </main>
  );
}
