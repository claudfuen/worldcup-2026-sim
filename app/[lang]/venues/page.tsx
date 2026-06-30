import type { Metadata } from "next";
import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { RelatedLinks } from "@/components/related-links";
import { VenueMap } from "@/components/venue-map";
import { Flag } from "@/components/flag";
import { VENUES, COUNTRIES, type Venue } from "@/lib/data/venues";
import type { MatchInfo } from "@/lib/predictions";
import { getT, getLocale, getIntlLocale } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("venues.metaTitle");
  const description = t("venues.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/venues", locale),
    openGraph: { title, description, url: localeHref(locale, "/venues"), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const ROUND_SHORT: Record<string, string> = {
  GROUP: "rounds.shortGroup", R32: "rounds.shortR32", R16: "rounds.shortR16", QF: "rounds.shortQF", SF: "rounds.shortSF", "3P": "rounds.shortThird", FINAL: "rounds.shortFinal",
};
const ROUND_ORDER = ["GROUP", "R32", "R16", "QF", "SF", "3P", "FINAL"];

export default async function VenuesPage() {
  const t = await getT();
  const locale = await getLocale();
  const intl = await getIntlLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const matches = overlayLive(data.matches, live);

  const byVenue = new Map<string, MatchInfo[]>();
  for (const m of matches) {
    const arr = byVenue.get(m.venue) ?? [];
    arr.push(m);
    byVenue.set(m.venue, arr);
  }
  const counts: Record<string, number> = {};
  for (const v of VENUES) counts[v.slug] = (byVenue.get(v.key) ?? []).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={liveActivity(data.matches, live)} />
      <header className="mb-6 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("venues.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("venues.heading")}</h1>
        <p className="text-muted-foreground mt-2 text-base text-pretty">{t("venues.lede")}</p>
      </header>

      <VenueMap counts={counts} locale={locale} />
      <div className="text-muted-2 mt-2 mb-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {COUNTRIES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: c === "USA" ? "var(--win)" : c === "Mexico" ? "var(--contention)" : "var(--data-cool)" }} />
            {t(`teams.${c === "USA" ? "USA" : c === "Mexico" ? "MEX" : "CAN"}`)}
          </span>
        ))}
        <span className="ms-auto">{t("venues.dotHint")}</span>
      </div>

      {COUNTRIES.map((country) => {
        const list = VENUES.filter((v) => v.country === country);
        return (
          <section key={country} className="mb-10">
            <div className="mb-3 flex items-center gap-2">
              <Flag code={country === "USA" ? "USA" : country === "Mexico" ? "MEX" : "CAN"} size={20} />
              <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">
                {t(`teams.${country === "USA" ? "USA" : country === "Mexico" ? "MEX" : "CAN"}`)} · {t("venues.venuesCount", { n: list.length })}
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((v) => (
                <VenueCard key={v.slug} v={v} matches={byVenue.get(v.key) ?? []} locale={locale} intl={intl} t={t} />
              ))}
            </div>
          </section>
        );
      })}

      <RelatedLinks
        links={[
          { label: t("venues.relatedSchedule"), href: localeHref(locale, "/schedule"), hint: t("venues.relatedScheduleHint") },
          { label: t("venues.relatedBracket"), href: localeHref(locale, "/bracket") },
          { label: t("venues.relatedCalendar"), href: localeHref(locale, "/calendar") },
        ]}
      />
    </main>
  );
}

function VenueCard({ v, matches, locale, intl, t }: { v: Venue; matches: MatchInfo[]; locale: string; intl: string; t: (k: string, p?: Record<string, string | number>) => string }) {
  const played = matches.filter((m) => m.status === "final").length;
  const rounds = ROUND_ORDER.filter((r) => matches.some((m) => m.round === r));
  const hostsFinal = matches.some((m) => m.round === "FINAL");
  return (
    <Link
      href={localeHref(locale as never, `/venues/${v.slug}`)}
      className={`group border-border bg-card hover:border-primary/50 hover:bg-surface-raised dark:inset-ring dark:inset-ring-white/5 flex flex-col rounded-2xl border p-4 transition-colors ${hostsFinal ? "border-contention/45" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight">{v.fifaName}</div>
          <div className="text-muted-2 mt-0.5 truncate text-xs">{v.key}</div>
        </div>
        {hostsFinal && <span className="text-contention border-contention/40 bg-contention/10 shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide uppercase">{t("venues.final")}</span>}
      </div>
      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>{v.city}</span>
        <span className="text-muted-2">·</span>
        <span className="tabular-nums">{t("venues.capacity", { cap: v.capacity.toLocaleString(intl) })}</span>
      </div>
      <div className="border-border/50 mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-foreground/90 font-mono text-xs tabular-nums">
          {t("venues.matchesCount", { n: matches.length })}
          {played > 0 && <span className="text-muted-2"> · {t("venues.playedCount", { n: played })}</span>}
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {rounds.map((r) => (
            <span key={r} className={`rounded px-1 py-0.5 font-mono text-[9px] font-semibold tracking-wide uppercase ${r === "FINAL" ? "text-contention bg-contention/10" : "text-muted-foreground bg-muted/50"}`}>{t(ROUND_SHORT[r])}</span>
          ))}
        </span>
      </div>
    </Link>
  );
}
