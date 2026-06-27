import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { finalizeGroups, ratingsFromTeams } from "@/lib/liveProjection";
import { GROUPS } from "@/lib/data/teams";
import { slugForCode } from "@/lib/slug";
import { Flag } from "@/components/flag";
import { ShareBar } from "@/components/share-bar";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { LocalTime } from "@/components/local-time";
import { AdvanceBadge } from "@/components/view/advance-badge";
import { teamAdvanceDisplay } from "@/lib/view/advance";
import { pct } from "@/lib/format";
import { ProbMeter } from "@/components/prob-meter";
import { HotBadge } from "@/components/hot-badge";
import { computeWatchability } from "@/lib/watchability";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { type RelLink } from "@/components/related-links";
import { ExploreSection } from "@/components/explore-section";
import { BracketTeaser } from "@/components/bracket-teaser";
import { GroupsPreview } from "@/components/groups-preview";
import { TitleOdds } from "@/components/title-odds";
import type { GroupTeamView } from "@/lib/predictions";
import type { Metadata } from "next";
import { getT, getLocale } from "@/lib/i18n/server";
import { localizeGroups, localizeMatches, localizeTeams } from "@/lib/i18n/localize-payload";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-request live overlay: a finished match shows its score at once

export function generateStaticParams() {
  return GROUPS.map((g) => ({ letter: g.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ letter: string }> }): Promise<Metadata> {
  const { letter } = await params;
  const L = letter.toUpperCase();
  const t = await getT();
  const locale = await getLocale();
  if (!GROUPS.includes(L)) return { title: t("groupDetail.fallbackTitle") };
  const path = `/group/${L.toLowerCase()}`;
  const title = t("groupDetail.metaTitle", { group: L });
  const description = t("groupDetail.metaDesc", { group: L });
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates(path, locale),
    openGraph: { title, description, url: localeHref(locale, path), type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GroupPage({ params }: { params: Promise<{ letter: string }> }) {
  const { letter } = await params;
  const L = letter.toUpperCase();
  if (!GROUPS.includes(L)) notFound();
  const t = await getT();
  const locale = await getLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  const hasLive = liveActivity(data.matches, live);
  // Finalize standings/clinch from results known right now, so a finished match updates the table instantly.
  // Localize team display names on the FINAL groups (finalizeGroups re-derives English names) before render.
  const groups = localizeGroups(
    hasLive ? finalizeGroups(data.groups, overlaid, ratingsFromTeams(data.teams)) : data.groups,
    t,
  );
  const gv = groups.find((g) => g.group === L);
  if (!gv) notFound();
  const fixtures = localizeMatches(
    overlaid
      .filter((m) => m.round === "GROUP" && m.group === L)
      .sort((a, b) => a.utc.localeCompare(b.utc)),
    t,
  );
  const leader = gv.teams[0];
  const hotByMatch = computeWatchability(overlaid, data.teams, groups).byMatch;

  // A one-line "state of the group" verdict — who's through, who's chasing the third-place route, who's out.
  const through = gv.teams.filter((t) => t.status === "won_group" || t.status === "second" || t.status === "advanced");
  const out = gv.teams.filter((t) => t.status === "eliminated");
  const contending = gv.teams.filter((t) => t.status === "live").sort((a, b) => b.advance - a.advance);
  const verdict: string[] = [];
  if (through.length) verdict.push(t("groupDetail.verdictQualified", { teams: nameList(through), count: through.length }));
  if (contending[0] && contending[0].advance > 0.02) verdict.push(t("groupDetail.verdictContending", { team: contending[0].name, pct: pct(contending[0].advance) }));
  if (out.length) verdict.push(t("groupDetail.verdictOut", { teams: nameList(out) }));

  // Thin secondary links beneath the preview cards: jump to the adjacent groups + the schedule (the bracket
  // and all-groups grid get rich preview cards below).
  const gi = GROUPS.indexOf(L);
  const related: RelLink[] = [];
  if (gi > 0) related.push({ label: t("groupDetail.groupLabel", { group: GROUPS[gi - 1] }), href: localeHref(locale, `/group/${GROUPS[gi - 1].toLowerCase()}`) });
  if (gi < GROUPS.length - 1) related.push({ label: t("groupDetail.groupLabel", { group: GROUPS[gi + 1] }), href: localeHref(locale, `/group/${GROUPS[gi + 1].toLowerCase()}`) });
  related.push({ label: t("groupDetail.fullScheduleLink"), href: localeHref(locale, "/schedule") });
  related.push({ label: t("groupDetail.howItWorksLink"), href: localeHref(locale, "/methodology") });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <Breadcrumbs items={[{ label: t("groupDetail.homeCrumb"), href: localeHref(locale, "/") }, { label: t("nav.groups"), href: localeHref(locale, "/groups") }, { label: t("groupDetail.groupLabel", { group: L }) }]} />
      <header className="mt-3 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("groupDetail.eyebrow")}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t("groupDetail.heading", { group: L })}</h1>
        {verdict.length > 0 && (
          <p className="text-foreground mt-2 text-base text-pretty">{t("groupDetail.verdictSentence", { verdict: verdict.join(" · ") })}</p>
        )}
        <p className="text-muted-2 mt-2 text-xs text-pretty">
          {t("groupDetail.footnote")}
        </p>
        <div className="mt-4">
          <ShareBar text={t("groupDetail.shareText", { group: L, lead: leader ? t("groupDetail.shareLead", { team: leader.name }) : t("groupDetail.shareLive") })} path={`/group/${letter.toLowerCase()}`} />
        </div>
      </header>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("groupDetail.standingsHeading")}</h2>
          <div className="border-border bg-card overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-[10px] tracking-wide">
                <th className="py-2 pr-1 pl-3 text-left font-medium">{t("groupDetail.colTeam")}</th>
                <th className="w-6 px-1 text-center font-medium" title={t("groupDetail.colPlayedTitle")}>{t("groupDetail.colPlayed")}</th>
                <th className="w-6 px-1 text-center font-medium" title={t("groupDetail.colWonTitle")}>{t("groupDetail.colWon")}</th>
                <th className="w-6 px-1 text-center font-medium" title={t("groupDetail.colDrawnTitle")}>{t("groupDetail.colDrawn")}</th>
                <th className="w-6 px-1 text-center font-medium" title={t("groupDetail.colLostTitle")}>{t("groupDetail.colLost")}</th>
                <th className="hidden w-7 px-1 text-center font-medium sm:table-cell" title={t("groupDetail.colGoalsForTitle")}>{t("groupDetail.colGoalsFor")}</th>
                <th className="hidden w-7 px-1 text-center font-medium sm:table-cell" title={t("groupDetail.colGoalsAgainstTitle")}>{t("groupDetail.colGoalsAgainst")}</th>
                <th className="w-7 px-1 text-center font-medium" title={t("groupDetail.colGoalDiffTitle")}>{t("groupDetail.colGoalDiff")}</th>
                <th className="w-7 px-1 text-center font-semibold" title={t("groupDetail.colPointsTitle")}>{t("groupDetail.colPoints")}</th>
                <th className="w-16 px-1 pr-3 text-right font-medium" title={t("groupDetail.colAdvanceTitle")}>{t("groupDetail.colAdvance")}</th>
              </tr>
            </thead>
            <tbody>
              {gv.teams.map((tm, i) => {
                const elim = tm.status === "eliminated";
                const zone = i <= 1 ? "border-l-win" : i === 2 ? "border-l-contention" : "border-l-transparent";
                return (
                  <tr key={tm.code} className={`border-border/40 border-b border-l-2 last:border-b-0 ${zone} ${elim ? "opacity-45" : ""}`}>
                    <td className="py-2 pr-1 pl-2.5">
                      <Link href={localeHref(locale, `/team/${slugForCode(tm.code)}`)} className="flex items-center gap-2 hover:underline">
                        <span className="text-muted-2 w-3 text-center font-mono text-[11px]">{i + 1}</span>
                        <Flag code={tm.code} size={20} />
                        <span className={`truncate text-[13px] font-medium ${elim ? "line-through" : ""}`}>{tm.name}</span>
                      </Link>
                    </td>
                    <Cell v={tm.played} muted />
                    <Cell v={tm.w} muted />
                    <Cell v={tm.d} muted />
                    <Cell v={tm.l} muted />
                    <Cell v={tm.gf} muted cls="hidden sm:table-cell" />
                    <Cell v={tm.ga} muted cls="hidden sm:table-cell" />
                    <Cell v={(tm.gd >= 0 ? "+" : "") + tm.gd} />
                    <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{tm.pts}</td>
                    <td className="px-1 pr-3 text-right whitespace-nowrap">
                      {tm.status === "live" ? (
                        <span className="inline-flex justify-end"><ProbMeter p={tm.advance} width={18} className="text-muted-foreground text-[11px]" /></span>
                      ) : (
                        <AdvanceBadge d={teamAdvanceDisplay(tm, i)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

        <section className="lg:col-span-2">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{t("groupDetail.matchesHeading")}</h2>
          <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
          {fixtures.map((m) => {
            const final = m.status === "final";
            const live = m.status === "live";
            return (
              <Link key={m.match} href={localeHref(locale, `/match/${m.match}`)} className="hover:bg-muted/30 flex items-center gap-3 px-4 py-2.5 transition-colors">
                <span className="text-muted-2 w-14 shrink-0 font-mono text-[11px] sm:w-24"><LocalTime utc={m.utc} mode="day" /></span>
                <Flag code={m.home} size={16} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.homeName} <span className="text-muted-foreground">{t("groupDetail.vSeparator")}</span> {m.awayName}</span>
                {hotByMatch.get(m.match)?.hot && <HotBadge className="shrink-0" />}
                {(final || live) && (
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{m.homeScore}–{m.awayScore}</span>
                )}
              </Link>
            );
          })}
        </div>
        </section>
      </div>

      <ExploreSection title={t("groupDetail.exploreTitle")} links={related}>
        <GroupsPreview groups={groups} />
        <BracketTeaser matches={localizeMatches(overlaid, t)} teams={localizeTeams(data.teams, t)} />
        <TitleOdds teams={localizeTeams(data.teams, t)} />
      </ExploreSection>

      <p className="text-muted-2 mt-8 text-xs">
        {t("groupDetail.footerOdds", { iterations: data.iterations })}{" "}
        <Link href={localeHref(locale, "/methodology")} className="text-primary">{t("groupDetail.howItWorksArrow")}</Link>
      </p>
    </main>
  );
}

function Cell({ v, muted, cls }: { v: number | string; muted?: boolean; cls?: string }) {
  return <td className={`px-1 text-center font-mono text-xs tabular-nums ${muted ? "text-muted-foreground" : ""} ${cls ?? ""}`}>{v}</td>;
}

function nameList(ts: GroupTeamView[]): string {
  const n = ts.map((t) => t.name);
  if (n.length <= 1) return n.join("");
  if (n.length === 2) return `${n[0]} & ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
}
