import type { Metadata } from "next";
import Link from "next/link";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { slugForCode } from "@/lib/slug";
import type { GroupTeamView } from "@/lib/predictions";
import { provisionalGroup, ratingsFromTeams, liveThirdPlaceRace, finalizeGroups, type ProvisionalGroup } from "@/lib/liveProjection";
import { Flag } from "@/components/flag";
import { ThirdPlaceRace } from "@/components/third-place-race";
import { AdvanceBadge } from "@/components/view/advance-badge";
import { teamAdvanceDisplay } from "@/lib/view/advance";
import { isClinched } from "@/lib/view/types";
import { ProvisionalStandings } from "@/components/provisional-standings";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { RelatedLinks } from "@/components/related-links";
import { getT, getLocale, type TFunction } from "@/lib/i18n/server";
import { localizeGroups, localizeThird } from "@/lib/i18n/localize-payload";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref, type Locale } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("groups.metaTitle");
  const description = t("groups.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/groups", locale),
    openGraph: { title, description, url: localeHref(locale, "/groups"), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GroupsPage() {
  const t = await getT();
  const locale = await getLocale();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const overlaid = overlayLive(data.matches, live);
  const ratings = ratingsFromTeams(data.teams);
  const hasLive = liveActivity(data.matches, live);
  // Finalize standings/clinch from full-time results known right now (so a finished group locks instantly).
  const groups = hasLive ? finalizeGroups(data.groups, overlaid, ratings) : data.groups;
  const provByGroup: Record<string, ProvisionalGroup | null> = {};
  for (const g of groups) {
    provByGroup[g.group] = provisionalGroup(
      g.group,
      overlaid.filter((x) => x.round === "GROUP" && x.group === g.group),
      ratings,
    );
  }
  // Whenever results are moving (in-progress OR just-finished-before-cron), rebuild the third-place race
  // from the finalized groups so it stays consistent with the live group cards; otherwise the cron snapshot
  // (which also carries Annex-C slot data). Gated on hasLive, matching the cards — not just in-progress.
  const thirdRace = hasLive
    ? liveThirdPlaceRace(groups, provByGroup, ratings, data.thirdPlaceRace)
    : (data.thirdPlaceRace ?? []);
  // A one-line state-of-the-group-stage verdict, mirroring the editorial lede on the other pages.
  const decidedCount = groups.filter((g) => g.decided).length;
  const qualified = groups
    .flatMap((g) => g.teams)
    .filter((t) => t.status === "won_group" || t.status === "second" || t.status === "advanced").length;
  const verdict =
    decidedCount === groups.length
      ? t("groups.verdictAllSettled", { total: groups.length })
      : t("groups.verdictPartial", { settled: decidedCount, total: groups.length, through: qualified });
  // Localize team display names on the FINAL structures (after finalizeGroups re-derives English names),
  // right before passing them to components. Slugs/codes/logic are unaffected.
  const localizedGroups = localizeGroups(groups, t);
  const localizedThird = localizeThird(thirdRace, t);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={hasLive} />
      <header className="mb-6 max-w-3xl">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("groups.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("groups.heading")}</h1>
        <p className="text-foreground mt-2 text-base text-pretty">{verdict}</p>
        <p className="text-muted-2 mt-2 text-xs text-pretty">{t("groups.subhead")}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {localizedGroups.map((g) => (
          <GroupCard key={g.group} t={t} locale={locale} group={g.group} teams={g.teams} decided={g.decided} prov={provByGroup[g.group]} />
        ))}
      </div>
      <Legend t={t} />
      <p className="text-muted-2 mt-3 max-w-3xl text-xs">
        {t("groups.footnoteLead")} <span className="font-bold text-win">✓</span>{" "}
        {t("groups.footnoteClinch")} <span className="text-win">▲</span>
        <span className="text-destructive">▼</span> {t("groups.footnoteDelta")}
      </p>
      <ThirdPlaceRace entries={localizedThird} />
      <RelatedLinks
        links={[
          { label: t("nav.bracket"), href: localeHref(locale, "/bracket"), hint: t("groups.linkBracketHint") },
          { label: t("groups.linkFullSchedule"), href: localeHref(locale, "/schedule") },
          { label: t("nav.overview"), href: localeHref(locale, "/"), hint: t("groups.linkOverviewHint") },
        ]}
      />
    </main>
  );
}

function GroupCard({ t, locale, group, teams, decided, prov }: { t: TFunction; locale: Locale; group: string; teams: GroupTeamView[]; decided: boolean; prov?: ProvisionalGroup | null }) {
  const live = !!prov;
  return (
    <div className={`bg-card overflow-hidden rounded-2xl border ${live ? "border-live/40" : "border-border"}`}>
      <div className="border-border/60 flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-semibold"><Link href={localeHref(locale, `/group/${group.toLowerCase()}`)} className="hover:text-primary transition-colors">{t("groups.groupLabel", { group })}</Link></h2>
        {live ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wide text-live uppercase">
            <span className="size-1.5 animate-pulse rounded-full bg-live" />{t("common.live")}
          </span>
        ) : (
          <span className={`font-mono text-[10px] font-semibold tracking-wide uppercase ${decided ? "text-win" : "text-muted-foreground"}`}>
            {decided ? t("common.final") : t("groups.inProgress")}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-[10px] tracking-wide">
            <th className="py-1.5 pr-1 pl-3 text-left font-medium">{t("groups.colTeam")}</th>
            <th className="w-6 px-1 text-center font-medium" title={t("groups.colPlayedTitle")}>{t("groups.colPlayed")}</th>
            <th className="w-6 px-1 text-center font-medium" title={t("groups.colWonTitle")}>{t("groups.colWon")}</th>
            <th className="w-6 px-1 text-center font-medium" title={t("groups.colDrawnTitle")}>{t("groups.colDrawn")}</th>
            <th className="w-6 px-1 text-center font-medium" title={t("groups.colLostTitle")}>{t("groups.colLost")}</th>
            <th className="hidden w-7 px-1 text-center font-medium sm:table-cell" title={t("groups.colGfTitle")}>{t("groups.colGf")}</th>
            <th className="hidden w-7 px-1 text-center font-medium sm:table-cell" title={t("groups.colGaTitle")}>{t("groups.colGa")}</th>
            <th className="w-7 px-1 text-center font-medium" title={t("groups.colGdTitle")}>{t("groups.colGd")}</th>
            <th className="w-7 px-1 text-center font-semibold" title={t("groups.colPtsTitle")}>{t("groups.colPts")}</th>
            <th className="w-14 px-1 pr-3 text-right font-medium" title={t("groups.colAdvTitle")}>{t("groups.colAdv")}</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, i) => (
            <Row key={team.code} t={t} locale={locale} team={team} pos={i + 1} cut={i === 1 ? "qualify" : i === 2 ? "third" : null} />
          ))}
        </tbody>
      </table>
      {teams.some((team) => team.need) && (
        <div className="border-border/60 space-y-1.5 border-t px-4 py-3">
          {teams.filter((team) => team.need).map((team) => (
            <div key={team.code} className="flex items-center gap-2 text-xs">
              <Link href={localeHref(locale, `/team/${slugForCode(team.code)}`)} className="flex shrink-0 items-center gap-1.5 hover:underline">
                <Flag code={team.code} size={14} />
                <span className="text-foreground/80 font-medium">{team.name}</span>
              </Link>
              <span className="text-muted-foreground">{team.need}</span>
            </div>
          ))}
        </div>
      )}
      {prov && (
        <div className="border-border/60 border-t pt-2">
          <ProvisionalStandings proj={prov} bare />
        </div>
      )}
    </div>
  );
}

function Row({ t, locale, team, pos, cut }: { t: TFunction; locale: Locale; team: GroupTeamView; pos: number; cut: "qualify" | "third" | null }) {
  const d = teamAdvanceDisplay(team, pos - 1);
  const elim = d.kind === "eliminated";
  const zone = pos <= 2 ? "border-l-win" : pos === 3 ? "border-l-contention" : "border-l-transparent";
  const cutBorder = cut === "qualify" ? "border-b-primary/50 border-b border-dashed" : cut === "third" ? "border-b-border border-b border-dotted" : "";
  return (
    <tr className={`border-l-2 ${zone} ${cutBorder} ${elim ? "opacity-45" : ""}`}>
      <td className="py-2 pr-1 pl-2.5">
        <Link href={localeHref(locale, `/team/${slugForCode(team.code)}`)} className="flex items-center gap-2 hover:underline">
          <span className="text-muted-foreground w-3 text-center font-mono text-[11px]">{pos}</span>
          <Flag code={team.code} size={20} />
          <span className={`truncate text-[13px] font-medium ${elim ? "line-through" : ""}`}>{team.name}{elim && <span className="sr-only"> {t("groups.srEliminated")}</span>}</span>
          {isClinched(d) && d.symbol && (
            <span title={d.kind === "wonGroup" ? t("groups.wonGroupTitle") : t("groups.advancedTitle")} className={d.kind === "wonGroup" ? "text-[10px]" : "text-win text-[9px] font-bold"}>
              {d.symbol}<span className="sr-only"> {d.kind === "wonGroup" ? t("groups.srWonGroup") : t("groups.srAdvanced")}</span>
            </span>
          )}
        </Link>
      </td>
      <Cell v={team.played} muted />
      <Cell v={team.w} muted />
      <Cell v={team.d} muted />
      <Cell v={team.l} muted />
      <Cell v={team.gf} muted cls="hidden sm:table-cell" />
      <Cell v={team.ga} muted cls="hidden sm:table-cell" />
      <Cell v={(team.gd >= 0 ? "+" : "") + team.gd} />
      <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{team.pts}</td>
      <td className="px-1 pr-3 text-right">
        <AdvanceBadge d={d} showDelta />
      </td>
    </tr>
  );
}

function Cell({ v, muted, cls }: { v: number | string; muted?: boolean; cls?: string }) {
  return <td className={`px-1 text-center font-mono text-xs tabular-nums ${muted ? "text-muted-foreground" : ""} ${cls ?? ""}`}>{v}</td>;
}

function Legend({ t }: { t: TFunction }) {
  return (
    <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-sm bg-win" /> {t("groups.legendDirect")}</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-1 rounded-sm bg-contention" /> {t("groups.legendThird")}</span>
      <span className="flex items-center gap-1.5"><span className="font-bold text-win">✓</span> {t("groups.legendClinched")}</span>
      <span className="flex items-center gap-1.5"><span className="line-through">{t("groups.legendTeamWord")}</span> {t("common.eliminated")}</span>
      <span>{t("groups.legendAdv")}</span>
    </div>
  );
}
