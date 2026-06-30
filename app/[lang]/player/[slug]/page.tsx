import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { getMatchSummary, type MatchSummary } from "@/lib/matchEvents";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RelatedLinks } from "@/components/related-links";
import { ShareBar } from "@/components/share-bar";
import { Flag } from "@/components/flag";
import { LocalTime } from "@/components/local-time";
import { findPlayer } from "@/lib/players";
import { TEAM_BY_CODE } from "@/lib/data/teams";
import { slugForCode } from "@/lib/slug";
import { forecastPct, ordinal } from "@/lib/format";
import { getT, getLocale, getIntlLocale } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref, localeConfig } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(slug: string) {
  const data = await getPredictions();
  return { data, view: findPlayer(data.awards, slug) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getT();
  const locale = await getLocale();
  const { view } = await load(slug).catch(() => ({ view: null }));
  if (!view) return { title: t("player.fallbackTitle") };
  const team = t(`teams.${view.teamCode}`);
  const title = t("player.metaTitle", { player: view.player, team });
  const description = t("player.metaDesc", { player: view.player, team });
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates(`/player/${slug}`, locale),
    openGraph: { title, description, url: localeHref(locale, `/player/${slug}`), type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

interface LogItem { matchNo: number; utc: string; sortMinute: number; minute: string; kind: "goal" | "assist"; penalty: boolean; oppCode: string | null }
interface Appearance {
  matchNo: number;
  utc: string;
  oppCode: string | null;
  round: string;
  status: "started" | "sub" | "bench";
  minutes: number;
  goals: number;
  cards: { card: "yellow" | "red"; minute: string }[];
}

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getT();
  const locale = await getLocale();
  const intl = await getIntlLocale();
  const [{ data, view }, live] = await Promise.all([load(slug), getLiveMatches()]);
  if (!view) notFound();

  const code = view.teamCode;
  const teamName = t(`teams.${code}`);
  const gb = view.goldenBoot;
  const info = view.info;
  const goals = info?.goals ?? gb?.goals ?? view.assists?.goals ?? 0;
  const assists = info?.assists ?? view.assists?.assists ?? gb?.assists ?? 0;
  const penalties = info?.penalties ?? gb?.penalties ?? 0;
  const appearances = info?.appearances ?? 0;
  const positionLabel = info?.position ? t(`player.pos${info.position}`) : "";

  // Goal/assist log — scan this player's team matches (cached summaries) for their events.
  const matches = overlayLive(data.matches, live).filter(
    (m) => (m.home === code || m.away === code) && (m.status === "final" || m.status === "live"),
  );
  const summaries = await Promise.all(
    matches.map((m) => getMatchSummary(m).catch((): MatchSummary => ({ events: [], stats: null }))),
  );
  const log: LogItem[] = [];
  const apps: Appearance[] = [];
  matches.forEach((m, i) => {
    const oppCode = m.home === code ? m.away : m.home;
    // Per-match log: squad status (started / came on / unused), minutes, goals and cards from the timeline.
    const side = m.home === code ? summaries[i].lineups?.home : summaries[i].lineups?.away;
    const lp = side?.find((p) => p.player === view.player);
    if (lp) {
      const mine = summaries[i].events.filter((e) => e.teamCode === code && (e.player === view.player || e.playerOff === view.player));
      const onEv = mine.find((e) => e.kind === "sub" && e.player === view.player);
      const offEv = mine.find((e) => e.kind === "sub" && e.playerOff === view.player);
      const status: Appearance["status"] = lp.starter ? "started" : lp.subbedIn || onEv ? "sub" : "bench";
      const on = lp.starter ? 0 : Math.floor(onEv?.sortMinute ?? 0);
      const off = Math.floor(offEv?.sortMinute ?? 90); // 90 baseline; ignores extra time/stoppage (an estimate)
      // Minutes are only an estimate when we can anchor the on-minute: a starter (on=0), or a sub whose
      // entry event we matched. A sub with no matched on-event → leave minutes unknown (0, hidden) not a wrong "90'".
      const minutes = status === "bench" || (status === "sub" && !onEv) ? 0 : Math.max(0, off - on);
      const goalsN = mine.filter((e) => e.kind === "goal" && e.player === view.player && e.goalType !== "own").length;
      const cards = mine.filter((e) => e.kind === "card" && e.player === view.player).map((e) => ({ card: e.card!, minute: e.minute }));
      apps.push({ matchNo: m.match, utc: m.utc, oppCode, round: m.round, status, minutes, goals: goalsN, cards });
    }
    for (const e of summaries[i].events) {
      if (e.kind !== "goal") continue;
      if (e.teamCode === code && e.player === view.player && e.goalType !== "own") {
        log.push({ matchNo: m.match, utc: m.utc, sortMinute: e.sortMinute, minute: e.minute, kind: "goal", penalty: e.goalType === "penalty", oppCode });
      }
      if (e.teamCode === code && e.assist === view.player) {
        log.push({ matchNo: m.match, utc: m.utc, sortMinute: e.sortMinute, minute: e.minute, kind: "assist", penalty: false, oppCode });
      }
    }
  });
  log.sort((a, b) => a.utc.localeCompare(b.utc) || a.sortMinute - b.sortMinute);
  apps.sort((a, b) => a.utc.localeCompare(b.utc));

  const stats: { label: string; value: string; accent?: boolean }[] = [
    { label: t("player.statGoals"), value: String(goals) },
    { label: t("player.statAssists"), value: String(assists) },
    { label: t("player.statPenalties"), value: String(penalties) },
    { label: t("player.statApps"), value: String(appearances) },
  ];
  if (gb && !gb.eliminated && goals > 0) {
    stats.push({ label: t("player.statProjected"), value: gb.projected.toFixed(1) });
    stats.push({ label: t("player.statGoldenBoot"), value: forecastPct(gb.winProb), accent: true });
  }
  const gridCols = stats.length > 4 ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={liveActivity(data.matches, live)} />
      <Breadcrumbs items={[
        { label: t("team.homeCrumb"), href: localeHref(locale, "/") },
        { label: teamName, href: localeHref(locale, `/team/${slugForCode(code)}`) },
        { label: view.player },
      ]} />
      <header className="mt-3 mb-6">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("player.eyebrow")}</div>
        <div className="mt-1.5 flex items-start gap-3">
          <span className="shrink-0"><Flag code={code} size={40} /></span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{view.player}</h1>
            <div className="text-muted-foreground mt-0.5 text-sm">
              <Link href={localeHref(locale, `/team/${slugForCode(code)}`)} className="hover:text-foreground hover:underline">{teamName}</Link>
              {positionLabel && <span className="text-muted-2"> · {positionLabel}</span>}
            </div>
          </div>
        </div>
        {view.gbRank != null && goals > 0 ? (
          <p className="text-muted-foreground mt-3 text-sm text-pretty">
            {t("player.lede", { rank: ordinal(view.gbRank, intl), goals, team: teamName })}
            {view.asRank != null && assists > 0 && <> {t("player.ledeAlsoAssists", { rank: ordinal(view.asRank, intl), assists })}</>}
          </p>
        ) : view.asRank != null && assists > 0 ? (
          <p className="text-muted-foreground mt-3 text-sm text-pretty">
            {t("player.ledeAssist", { rank: ordinal(view.asRank, intl), assists, team: teamName })}
          </p>
        ) : appearances > 0 ? (
          <p className="text-muted-foreground mt-3 text-sm text-pretty">
            {t("player.ledeApps", { count: appearances, team: teamName })}
          </p>
        ) : null}
        <div className="mt-4">
          <ShareBar text={t("player.share", { player: view.player, goals, assists })} path={`/player/${slug}`} />
        </div>
      </header>

      <dl className={`grid ${gridCols} gap-px overflow-hidden rounded-2xl border border-border bg-card dark:inset-ring dark:inset-ring-white/5`}>
        {stats.map((s) => (
          <div key={s.label} className="bg-card flex flex-col items-center gap-1 px-2 py-4">
            <dt className="text-muted-2 text-center text-[10px] font-medium tracking-wide uppercase">{s.label}</dt>
            <dd className={`font-mono text-lg font-bold tabular-nums ${s.accent ? "text-primary" : ""}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {log.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("player.logHeading")}</h2>
          <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
            {log.map((it, i) => (
              <Link key={i} href={localeHref(locale, `/match/${it.matchNo}`)} className="hover:bg-muted/20 flex items-center gap-3 px-4 py-2.5 transition-colors">
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${it.kind === "goal" ? "text-win bg-win/10" : "text-data-cool bg-data-cool/10"}`}>
                  {it.kind === "goal" ? (it.penalty ? t("player.logPenalty") : t("player.logGoal")) : t("player.logAssist")}
                </span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">{it.minute}</span>
                <span className="text-muted-2 text-xs">{t("common.vs")}</span>
                <Flag code={it.oppCode} size={16} />
                <span className="min-w-0 flex-1 truncate text-sm">{it.oppCode ? t(`teams.${it.oppCode}`) : t("common.tbd")}</span>
                <span className="text-muted-2 shrink-0 text-[11px]" suppressHydrationWarning><LocalTime utc={it.utc} mode="day" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {apps.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("player.appsHeading")}</h2>
          <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
            {apps.map((a) => {
              const statusLabel = a.status === "started" ? t("player.started") : a.status === "sub" ? t("player.sub") : t("player.bench");
              const statusClass =
                a.status === "started" ? "text-win bg-win/10" : a.status === "sub" ? "text-data-cool bg-data-cool/10" : "text-muted-2 bg-muted/40";
              return (
                <Link key={a.matchNo} href={localeHref(locale, `/match/${a.matchNo}`)} className="hover:bg-muted/20 flex items-center gap-2.5 px-4 py-2.5 transition-colors sm:gap-3">
                  <span className={`w-12 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold tracking-wide uppercase sm:w-14 ${statusClass}`}>
                    {statusLabel}
                  </span>
                  <span className="text-muted-2 hidden text-xs sm:inline">{t("common.vs")}</span>
                  <Flag code={a.oppCode} size={16} />
                  <span className="min-w-0 flex-1 truncate text-sm">{a.oppCode ? t(`teams.${a.oppCode}`) : t("common.tbd")}</span>
                  {a.goals > 0 && (
                    <span className="text-win shrink-0 text-xs font-medium tabular-nums" title={t("player.logGoal")} aria-label={t("player.logGoal")}>
                      ⚽{a.goals > 1 ? `×${a.goals}` : ""}
                    </span>
                  )}
                  {a.cards.map((c, ci) => (
                    <span
                      key={ci}
                      className={`size-2.5 shrink-0 rounded-[2px] ${c.card === "red" ? "bg-destructive" : "bg-contention"}`}
                      title={`${c.card === "red" ? t("player.cardRed") : t("player.cardYellow")} ${c.minute}`}
                      aria-label={`${c.card === "red" ? t("player.cardRed") : t("player.cardYellow")} ${c.minute}`}
                    />
                  ))}
                  {a.minutes > 0 && (
                    <span className="text-muted-2 w-8 shrink-0 text-right font-mono text-[11px] tabular-nums" title={t("player.minutesTitle")}>
                      {a.minutes}&apos;
                    </span>
                  )}
                  <span className="text-muted-2 hidden w-14 shrink-0 text-right text-[11px] sm:inline" suppressHydrationWarning><LocalTime utc={a.utc} mode="day" /></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <RelatedLinks
        links={[
          { label: t("player.relatedTeam", { team: teamName }), href: localeHref(locale, `/team/${slugForCode(code)}`) },
          { label: t("player.relatedAwards"), href: localeHref(locale, "/awards") },
        ]}
      />
    </main>
  );
}
