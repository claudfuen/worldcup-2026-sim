import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RelatedLinks } from "@/components/related-links";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { decidedOnPens, pensScore } from "@/lib/penalties";
import { VENUES, VENUE_BY_SLUG } from "@/lib/data/venues";
import type { MatchInfo } from "@/lib/predictions";
import { localizeMatches } from "@/lib/i18n/localize-payload";
import { getT, getLocale, getIntlLocale } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return VENUES.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const v = VENUE_BY_SLUG[slug];
  const t = await getT();
  const locale = await getLocale();
  if (!v) return { title: t("venues.fallbackTitle") };
  const title = t("venues.detailMetaTitle", { venue: v.fifaName });
  const description = t("venues.detailMetaDesc", { venue: v.fifaName, city: v.city });
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates(`/venues/${slug}`, locale),
    openGraph: { title, description, url: localeHref(locale, `/venues/${slug}`), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const ROUND_KEY: Record<string, string> = {
  GROUP: "rounds.GROUP", R32: "rounds.R32", R16: "rounds.R16", QF: "rounds.QF", SF: "rounds.SF", "3P": "rounds.THIRD", FINAL: "rounds.FINAL",
};
const ROUND_SHORT: Record<string, string> = {
  GROUP: "rounds.shortGroup", R32: "rounds.shortR32", R16: "rounds.shortR16", QF: "rounds.shortQF", SF: "rounds.shortSF", "3P": "rounds.shortThird", FINAL: "rounds.shortFinal",
};
const ROUND_ORDER = ["GROUP", "R32", "R16", "QF", "SF", "3P", "FINAL"];

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = VENUE_BY_SLUG[slug];
  if (!v) notFound();
  const t = await getT();
  const locale = await getLocale();
  const intl = await getIntlLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const matches = localizeMatches(overlayLive(data.matches, live), t)
    .filter((m) => m.venue === v.key)
    .sort((a, b) => a.utc.localeCompare(b.utc));

  const played = matches.filter((m) => m.status === "final");
  const goals = played.reduce((acc, m) => acc + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
  const hostName = t(`teams.${v.hostCode}`);
  const hostsFinal = matches.some((m) => m.round === "FINAL");
  const roundsHosted = ROUND_ORDER.filter((r) => matches.some((m) => m.round === r));

  const stats: { label: string; value: string }[] = [
    { label: t("venues.statMatches"), value: String(matches.length) },
    { label: t("venues.statPlayed"), value: String(played.length) },
    { label: t("venues.statGoals"), value: played.length ? String(goals) : "—" },
    { label: t("venues.statCapacity"), value: v.capacity.toLocaleString(intl) },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={liveActivity(data.matches, live)} />
      <Breadcrumbs items={[{ label: t("team.homeCrumb"), href: localeHref(locale, "/") }, { label: t("nav.stadiums"), href: localeHref(locale, "/venues") }, { label: v.fifaName }]} />
      <header className="mt-3 mb-6">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("venues.eyebrow")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{v.fifaName}</h1>
          {hostsFinal && (
            <span className="text-contention border-contention/40 bg-contention/10 shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("venues.hostsFinal")}</span>
          )}
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
          <span className="text-foreground/80">{v.key}</span>
          <span className="text-muted-2">·</span>
          <span className="inline-flex items-center gap-1.5"><Flag code={v.hostCode} size={16} /> {v.city}, {hostName}</span>
        </div>
        {roundsHosted.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-muted-2 me-1 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("venues.hosts")}</span>
            {roundsHosted.map((r) => (
              <span key={r} className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide uppercase ${r === "FINAL" ? "text-contention bg-contention/10" : "text-muted-foreground bg-muted/50"}`}>{t(ROUND_SHORT[r])}</span>
            ))}
          </div>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-card sm:grid-cols-4 dark:inset-ring dark:inset-ring-white/5">
        {stats.map((s) => (
          <div key={s.label} className="bg-card flex flex-col items-center gap-1 px-2 py-4">
            <dt className="text-muted-2 text-[10px] font-medium tracking-wide uppercase">{s.label}</dt>
            <dd className="font-mono text-lg font-bold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="text-muted-foreground mt-8 mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("venues.matchesHeading")}</h2>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        {matches.map((m) => <VenueMatchRow key={m.match} m={m} locale={locale} t={t} />)}
      </div>

      <RelatedLinks
        links={[
          { label: t("venues.relatedAllVenues"), href: localeHref(locale, "/venues") },
          { label: t("venues.relatedSchedule"), href: localeHref(locale, "/schedule") },
          { label: t("venues.relatedBracket"), href: localeHref(locale, "/bracket") },
        ]}
      />
    </main>
  );
}

function side(m: MatchInfo, which: "home" | "away") {
  const code = which === "home" ? m.home : m.away;
  const name = which === "home" ? m.homeName : m.awayName;
  const proj = (which === "home" ? m.projHome : m.projAway)?.[0];
  const slot = which === "home" ? m.slotHome : m.slotAway;
  return { code: code ?? proj?.code ?? null, name: name ?? proj?.name ?? slot ?? null, resolved: !!code };
}

function VenueMatchRow({ m, locale, t }: { m: MatchInfo; locale: string; t: TFunction }) {
  const final = m.status === "final";
  const live = m.status === "live";
  const h = side(m, "home");
  const a = side(m, "away");
  const ps = final && decidedOnPens(m) ? pensScore(m) : null;
  const homeWin = final && (m.winner ? m.winner === m.home : (m.homeScore ?? 0) > (m.awayScore ?? 0));
  const awayWin = final && (m.winner ? m.winner === m.away : (m.awayScore ?? 0) > (m.homeScore ?? 0));
  return (
    <Link href={localeHref(locale as never, `/match/${m.match}`)} className="hover:bg-muted/20 flex items-center gap-3 px-4 py-2.5 transition-colors">
      <div className="text-muted-2 w-16 shrink-0 text-[11px]">
        <div className="font-mono whitespace-nowrap" suppressHydrationWarning><LocalTime utc={m.utc} mode="day" /></div>
        <div className="text-[10px] leading-tight">{t(ROUND_KEY[m.round] ?? "")}{m.group ? ` ${m.group}` : ""}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <Row code={h.code} name={h.name} win={homeWin} resolved={h.resolved} />
        <Row code={a.code} name={a.name} win={awayWin} resolved={a.resolved} />
      </div>
      <div className="shrink-0 text-right">
        {final || live ? (
          <div className="space-y-0.5 font-mono text-sm tabular-nums">
            <div className={homeWin ? "text-foreground font-bold" : "text-muted-foreground"}>{m.homeScore}{ps && <span className="text-muted-2 ms-0.5 text-[11px] font-normal">({ps.home})</span>}</div>
            <div className={awayWin ? "text-foreground font-bold" : "text-muted-foreground"}>{m.awayScore}{ps && <span className="text-muted-2 ms-0.5 text-[11px] font-normal">({ps.away})</span>}</div>
          </div>
        ) : (
          <div className="text-muted-2 font-mono text-[11px]" suppressHydrationWarning><LocalTime utc={m.utc} mode="timeshort" /></div>
        )}
        <div className={`mt-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${live ? "text-live" : final ? "text-win" : "text-muted-2"}`}>
          {live ? (m.liveDetail ?? t("common.live")) : final ? t("scoreTicker.ft") : ""}
        </div>
      </div>
    </Link>
  );
}

function Row({ code, name, win, resolved }: { code: string | null; name: string | null; win: boolean; resolved: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Flag code={code} size={16} />
      <span className={`min-w-0 truncate ${win ? "font-bold" : resolved ? "font-medium" : "text-foreground/70"}`}>{name ?? "—"}</span>
    </span>
  );
}
