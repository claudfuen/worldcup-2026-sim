import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { finalizeGroups, ratingsFromTeams } from "@/lib/liveProjection";
import { TEAMS } from "@/lib/data/teams";
import { teamSlug, teamFromSlug } from "@/lib/slug";
import { Flag } from "@/components/flag";
import { ShareBar } from "@/components/share-bar";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { LocalTime } from "@/components/local-time";
import { AdvanceBadge } from "@/components/view/advance-badge";
import { R32ByFinish } from "@/components/r32-by-finish";
import { HotBadge } from "@/components/hot-badge";
import { computeWatchability } from "@/lib/watchability";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ExploreSection } from "@/components/explore-section";
import { BracketTeaser } from "@/components/bracket-teaser";
import { GroupsPreview } from "@/components/groups-preview";
import { TitleOdds } from "@/components/title-odds";
import { teamAdvanceDisplay } from "@/lib/view/advance";
import { isClinched } from "@/lib/view/types";
import { forecastPct } from "@/lib/format";
import type { Metadata } from "next";
import { getT, getLocale } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-request live overlay: a finished match shows its score at once

export function generateStaticParams() {
  return TEAMS.map((t) => ({ slug: teamSlug(t.name) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const team = teamFromSlug(slug);
  const t = await getT();
  const locale = await getLocale();
  if (!team) return { title: t("team.fallbackTitle") };
  const path = `/team/${teamSlug(team.name)}`;
  const title = t("team.metaTitle", { team: team.name });
  const description = t("team.metaDesc", { team: team.name, group: team.group });
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates(path, locale),
    openGraph: { title, description, url: localeHref(locale, path), type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const ROUND_KEYS: [keyof RoundVals, string][] = [
  ["advance", "team.roundR32"],
  ["r16", "team.roundR16"],
  ["qf", "team.roundQF"],
  ["sf", "team.roundSF"],
  ["final", "team.roundFinal"],
  ["title", "team.roundChampion"],
];
type RoundVals = { advance: number; r16: number; qf: number; sf: number; final: number; title: number };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = teamFromSlug(slug);
  if (!team) notFound();
  const t = await getT();
  const locale = await getLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  const hasLive = liveActivity(data.matches, live);
  const groups = hasLive ? finalizeGroups(data.groups, overlaid, ratingsFromTeams(data.teams)) : data.groups;
  const pred = data.teams.find((t) => t.code === team.code);
  const rank = data.teams.findIndex((t) => t.code === team.code) + 1;
  const groupView = groups.find((g) => g.group === team.group);
  const row = groupView?.teams.find((t) => t.code === team.code);
  const fixtures = overlaid
    .filter((m) => m.round === "GROUP" && (m.home === team.code || m.away === team.code))
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const hotByMatch = computeWatchability(overlaid, data.teams, groups).byMatch;

  const advancePct = pred ? forecastPct(pred.advance) : "-";
  const titlePct = pred ? forecastPct(pred.title) : "-";
  // A clinched Round-of-32 place is a FACT (✓), never a capped forecast %. Derived from the SAME
  // AdvanceDisplay union the standings cell renders, so the funnel/lede can never disagree with the table.
  const advanceDisp = row ? teamAdvanceDisplay(row, groupRank(groupView, team.code) - 1) : undefined;
  const advanceClinched = !!advanceDisp && isClinched(advanceDisp);
  const advanceOut = advanceDisp?.kind === "eliminated";
  const statusWord =
    row?.status === "won_group" ? t("team.statusWonGroup")
      : row?.status === "second" ? t("team.statusSecond")
      : row?.status === "advanced" ? t("team.statusAdvanced")
      : row?.status === "eliminated" ? t("team.statusEliminated")
      : t("team.statusPlace", {
          place: row ? ordinal(groupRank(groupView, team.code)) : "",
          group: team.group,
        });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <Breadcrumbs items={[{ label: t("team.homeCrumb"), href: localeHref(locale, "/") }, { label: t("nav.groups"), href: localeHref(locale, "/groups") }, { label: t("team.groupCrumb", { group: team.group }), href: localeHref(locale, `/group/${team.group.toLowerCase()}`) }, { label: team.name }]} />
      <header className="mt-3 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("team.eyebrow")} · <Link href={localeHref(locale, `/group/${team.group.toLowerCase()}`)} className="hover:underline">{t("team.groupCrumb", { group: team.group })}</Link></div>
        <div className="mt-1.5 flex items-start gap-3">
          <span className="shrink-0"><Flag code={team.code} size={40} /></span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("team.heading", { team: team.name })}</h1>
        </div>
        {pred && (
          <p className="text-muted-foreground mt-3 text-sm text-pretty">
            {t("team.ledePrefix", { team: team.name, status: statusWord })}
            {advanceOut ? (
              <>{t("team.ledeOut", { group: team.group })}</>
            ) : advanceClinched ? (
              <>{t("team.ledeClinchedA")} <span className="text-foreground font-medium">{titlePct}</span> {t("team.ledeClinchedB")} <span className="text-foreground font-medium">{ordinal(rank)}</span>{t("team.ledeClinchedC", { iterations: data.iterations })}</>
            ) : (
              <>{t("team.ledeRaceA")} <span className="text-foreground font-medium">{advancePct}</span> {t("team.ledeRaceB")}{" "}
              <span className="text-foreground font-medium">{titlePct}</span> {t("team.ledeRaceC")}{" "}
              <span className="text-foreground font-medium">{ordinal(rank)}</span>{t("team.ledeRaceD", { iterations: data.iterations })}</>
            )}
          </p>
        )}
        {pred && (
          <div className="mt-4">
            <ShareBar
              text={
                advanceClinched
                  ? t("team.shareClinched", { team: team.name, title: titlePct })
                  : advanceOut
                    ? t("team.shareOut", { team: team.name })
                    : t("team.shareRace", { team: team.name, advance: advancePct, title: titlePct })
              }
              path={`/team/${slug}`}
            />
          </div>
        )}
      </header>

      {pred && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("team.roundsHeading")}</h2>
          <div className="border-border bg-card grid grid-cols-3 gap-px overflow-hidden rounded-2xl border sm:grid-cols-6">
            {ROUND_KEYS.map(([key, labelKey]) => {
              const label = t(labelKey);
              const v = (pred as unknown as RoundVals)[key];
              const r32Clinched = key === "advance" && advanceClinched;
              const r32Out = key === "advance" && advanceOut;
              return (
                <div key={key} className="bg-card flex flex-col items-center gap-1 px-2 py-4" style={{ backgroundColor: heat(r32Clinched ? 1 : v) }}>
                  <span className="text-muted-2 text-[10px] font-medium tracking-wide uppercase">{label}</span>
                  <span className={`font-mono text-lg font-bold tabular-nums ${r32Clinched ? "text-win" : key === "title" ? "text-primary" : ""}`}>
                    {r32Clinched ? <span title={t("team.clinchedR32Title")}>✓</span> : r32Out ? t("team.outShort") : forecastPct(v)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {pred && !advanceOut && <R32ByFinish matches={overlaid} group={team.group} pred={pred} />}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-5">
      {groupView && (
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">{t("team.groupStandingsHeading", { group: team.group })}</h2>
            <Link href={localeHref(locale, `/group/${team.group.toLowerCase()}`)} className="text-primary text-xs">{t("team.fullGroupLink")}</Link>
          </div>
          <div className="border-border bg-card overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <tbody>
                {groupView.teams.map((tm, i) => {
                  const me = tm.code === team.code;
                  return (
                    <tr key={tm.code} className={`border-border/50 border-b last:border-0 ${me ? "bg-primary/[0.06]" : ""} ${i < 2 ? "border-l-win" : i === 2 ? "border-l-contention" : "border-l-transparent"} border-l-2`}>
                      <td className="py-2 pr-1 pl-3 text-muted-2 w-6 font-mono text-[11px]">{i + 1}</td>
                      <td className="py-2">
                        <Link href={localeHref(locale, `/team/${teamSlug(tm.name)}`)} className="flex items-center gap-2 hover:underline">
                          <Flag code={tm.code} size={18} />
                          <span className={`truncate text-[13px] ${me ? "font-semibold" : "font-medium"}`}>{tm.name}</span>
                        </Link>
                      </td>
                      <td className="px-1 text-center font-mono text-xs tabular-nums text-muted-foreground">{tm.played}</td>
                      <td className="px-1 text-center font-mono text-xs tabular-nums">{tm.gd >= 0 ? "+" : ""}{tm.gd}</td>
                      <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{tm.pts}</td>
                      <td className="px-2 pr-3 text-right">
                        <AdvanceBadge d={teamAdvanceDisplay(tm, i)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {fixtures.length > 0 && (
        <section className="lg:col-span-2">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("team.fixturesHeading", { team: team.name })}</h2>
          <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
            {fixtures.map((m) => {
              const final = m.status === "final";
              const live = m.status === "live";
              const oppName = m.home === team.code ? m.awayName : m.homeName;
              const oppCode = m.home === team.code ? m.away : m.home;
              return (
                <Link key={m.match} href={localeHref(locale, `/match/${m.match}`)} className="hover:bg-muted/30 flex items-center gap-3 px-4 py-2.5 transition-colors">
                  <span className="text-muted-2 w-14 shrink-0 font-mono text-[11px] sm:w-24"><LocalTime utc={m.utc} mode="day" /></span>
                  <span className="text-muted-foreground text-xs">{t("common.vs")}</span>
                  <Flag code={oppCode} size={18} />
                  <span className="min-w-0 flex-1 truncate text-sm">{oppName}</span>
                  {hotByMatch.get(m.match)?.hot && <HotBadge className="shrink-0" />}
                  {final || live ? (
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {m.home === team.code ? m.homeScore : m.awayScore}–{m.home === team.code ? m.awayScore : m.homeScore}
                    </span>
                  ) : m.favorite ? (
                    <span className="text-muted-2 shrink-0 text-[11px]">{m.favorite.code === team.code ? t("team.favored") : ""}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      )}
      </div>

      <ExploreSection
        title={t("team.exploreTitle")}
        links={[
          { label: t("team.groupCrumb", { group: team.group }), href: localeHref(locale, `/group/${team.group.toLowerCase()}`), hint: t("team.standingsHint") },
          { label: t("team.fullScheduleLink"), href: localeHref(locale, "/schedule") },
          { label: t("team.howItWorksLink"), href: localeHref(locale, "/methodology") },
        ]}
      >
        <BracketTeaser matches={overlaid} teams={data.teams} />
        <GroupsPreview groups={groups} />
        <TitleOdds teams={data.teams} />
      </ExploreSection>

      <p className="text-muted-2 mt-8 text-xs">
        {t("team.footerOdds", { iterations: data.iterations })}{" "}
        <Link href={localeHref(locale, "/methodology")} className="text-primary">{t("team.howItWorksArrow")}</Link>
      </p>
    </main>
  );
}

function heat(v: number): string {
  return `color-mix(in oklab, var(--primary) ${Math.round(Math.min(v, 1) * 22)}%, transparent)`;
}
function groupRank(gv: { teams: { code: string }[] } | undefined, code: string): number {
  return (gv?.teams.findIndex((t) => t.code === code) ?? 0) + 1;
}
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
