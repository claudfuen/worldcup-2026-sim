import Link from "next/link";
import { Flag } from "@/components/flag";
import { TEAM_BY_CODE } from "@/lib/data/teams";
import { teamSlug } from "@/lib/slug";
import type { ProvisionalGroup } from "@/lib/liveProjection";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// "If the live score holds" standings for one group. Deterministic (frozen current scoreline);
// the green/amber zones are provisional positions, a ✓ is mathematically guaranteed given the
// live result. The official table (completed matches only) is rendered elsewhere and untouched.
export async function ProvisionalStandings({ proj, bare }: { proj: ProvisionalGroup; bare?: boolean }) {
  const t = await getT();
  const locale = await getLocale();
  return (
    <div className={bare ? "overflow-hidden" : "border-border bg-card overflow-hidden rounded-2xl border"}>
      <div className="border-border/60 space-y-1 border-b px-4 py-2.5">
        {proj.live.map((l) => (
          <div key={l.home + l.away} className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-live">
              <span className="size-1.5 animate-pulse rounded-full bg-live" />{t("groups.liveUpper")}
            </span>
            <Link href={localeHref(locale, `/team/${teamSlug(TEAM_BY_CODE[l.home]?.name ?? l.home)}`)} className="flex items-center gap-1.5 hover:underline">
              <Flag code={l.home} size={14} />
              <span className="font-medium">{TEAM_BY_CODE[l.home]?.name ?? l.home}</span>
            </Link>
            <span className="font-mono font-bold tabular-nums">{l.homeGoals}&ndash;{l.awayGoals}</span>
            <Link href={localeHref(locale, `/team/${teamSlug(TEAM_BY_CODE[l.away]?.name ?? l.away)}`)} className="flex items-center gap-1.5 hover:underline">
              <span className="font-medium">{TEAM_BY_CODE[l.away]?.name ?? l.away}</span>
              <Flag code={l.away} size={14} />
            </Link>
          </div>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-[10px] tracking-wide">
            <th className="py-1.5 pr-1 pl-3 text-left font-medium">{t("groups.colTeam")}</th>
            <th className="w-6 px-1 text-center font-medium" title={t("groups.colPlayedTitle")}>{t("groups.colPlayed")}</th>
            <th className="w-7 px-1 text-center font-medium" title={t("groups.colGdTitle")}>{t("groups.colGd")}</th>
            <th className="w-7 px-1 text-center font-semibold" title={t("groups.colPtsTitle")}>{t("groups.colPts")}</th>
            <th className="px-2 pr-3 text-right font-medium">{t("groups.ifEndsNow")}</th>
          </tr>
        </thead>
        <tbody>
          {proj.rows.map((r, i) => {
            const pos = i + 1;
            const cl = proj.clinch[r.code];
            const isLive = proj.live.some((l) => l.home === r.code || l.away === r.code);
            const out = cl.eliminatedTop2 && cl.eliminatedTop3;
            const zone = pos <= 2 ? "border-l-win" : pos === 3 ? "border-l-contention" : "border-l-transparent";
            return (
              <tr key={r.code} className={`border-l-2 ${zone} ${out ? "opacity-45" : ""} ${isLive ? "bg-live/[0.06]" : ""}`}>
                <td className="py-2 pr-1 pl-2.5">
                  <Link href={localeHref(locale, `/team/${teamSlug(TEAM_BY_CODE[r.code]?.name ?? r.code)}`)} className="flex items-center gap-2 hover:underline">
                    <span className="text-muted-foreground w-3 text-center font-mono text-[11px]">{pos}</span>
                    <Flag code={r.code} size={18} />
                    <span className={`truncate text-[13px] font-medium ${out ? "line-through" : ""}`}>{TEAM_BY_CODE[r.code]?.name ?? r.code}</span>
                  </Link>
                </td>
                <td className="text-muted-foreground px-1 text-center font-mono text-xs tabular-nums">{r.played}</td>
                <td className="px-1 text-center font-mono text-xs tabular-nums">{r.gd >= 0 ? "+" : ""}{r.gd}</td>
                <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{r.pts}</td>
                <td className="px-2 pr-3 text-right text-xs">
                  {cl.winner ? (
                    <span className="text-win">{t("groups.provWinsGroup")}</span>
                  ) : cl.top2 ? (
                    <span className="text-win">{t("groups.provThrough")}</span>
                  ) : out ? (
                    <span className="text-muted-2">{t("groups.provOut")}</span>
                  ) : pos <= 2 ? (
                    <span className="text-win">{t("groups.provTop2")}</span>
                  ) : pos === 3 ? (
                    <span className="text-contention">{t("groups.provThird")}</span>
                  ) : (
                    <span className="text-muted-foreground">{t("groups.provFourth")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-2 border-border/60 border-t px-4 py-2.5 text-[11px]">
        {t("groups.provFootnoteLead")} <span className="text-win">✓</span> {t("groups.provFootnoteTail")}
      </p>
    </div>
  );
}
