import type { Metadata } from "next";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { ScheduleList } from "@/components/schedule-list";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { RelatedLinks } from "@/components/related-links";
import { computeWatchability } from "@/lib/watchability";
import { getT, getLocale } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("schedule.metaTitle");
  const description = t("schedule.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/schedule", locale),
    openGraph: { title, description, url: localeHref(locale, "/schedule"), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SchedulePage() {
  const t = await getT();
  const locale = await getLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const matches = overlayLive(data.matches, live);
  const { byMatch } = computeWatchability(matches, data.teams, data.groups);
  const hotReasons: Record<number, string> = {};
  for (const p of byMatch.values()) if (p.hot) hotReasons[p.match.match] = t(p.reason.key, p.reason.params);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={liveActivity(data.matches, live)} />
      <header className="mb-6 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("schedule.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("schedule.heading")}</h1>
        <p className="text-muted-foreground mt-2 text-base text-pretty">
          {t("schedule.lede")}
        </p>
      </header>
      <ScheduleList matches={matches} hotReasons={hotReasons} />
      <RelatedLinks
        links={[
          { label: t("schedule.relatedGroups"), href: localeHref(locale, "/groups") },
          { label: t("schedule.relatedBracket"), href: localeHref(locale, "/bracket"), hint: t("schedule.relatedBracketHint") },
          { label: t("schedule.relatedOverview"), href: localeHref(locale, "/"), hint: t("schedule.relatedOverviewHint") },
        ]}
      />
    </main>
  );
}
