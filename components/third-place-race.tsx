"use client";

import Link from "next/link";
import type { ThirdPlaceEntry } from "@/lib/predictions";
import { Flag } from "@/components/flag";
import { slugForCode } from "@/lib/slug";
import { forecastPct } from "@/lib/format";
import { ProbMeter } from "@/components/prob-meter";
import { useHoverTip, HoverTipPanel } from "@/components/hover-tip";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref } from "@/lib/i18n/config";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

// What still has to happen for a not-yet-settled third, computed from the full 12-row race. Six-or-fewer
// teams are mathematically locked above it (the DECIDED groups' thirds that outrank it); every still-playing
// group is a swing that could finish above OR below it. It reaches the top 8 iff at most 7 thirds end above
// it — i.e. at least `needBelow` of the swing groups must finish with a weaker 3rd. The likeliest of those
// swings (by advance %) are the hardest to clear.
function survival(e: ThirdPlaceEntry, all: ThirdPlaceEntry[]) {
  const above = (x: ThirdPlaceEntry) => (x.pts !== e.pts ? x.pts > e.pts : x.gd !== e.gd ? x.gd > e.gd : x.gf > e.gf);
  const others = all.filter((x) => x.code !== e.code);
  const lockedAbove = others.filter((x) => x.decided && above(x)).length;
  const swing = others.filter((x) => !x.decided);
  const needBelow = swing.length - (7 - lockedAbove);
  const dangers = [...swing].sort((a, b) => b.advanceProb - a.advanceProb).slice(0, 2).map((x) => `${x.name} ${forecastPct(x.advanceProb)}`);
  return { needBelow, swingCount: swing.length, letters: swing.map((x) => x.group).sort().join("/"), dangers };
}

// One row's hover detail: what (if anything) would still change the team's Round-of-32 fate, plus the
// model's top-3 likely opponents (probability conditional on the team actually advancing).
function RowTip({ e, all, t }: { e: ThirdPlaceEntry; all: ThirdPlaceEntry[]; t: TFunction }) {
  const through = e.status === "won_group" || e.status === "second" || e.status === "advanced";
  const matchLine = e.match
    ? e.city
      ? t("groups.tipMatchLineCity", { match: e.match, city: e.city })
      : t("groups.tipMatchLine", { match: e.match })
    : undefined;

  let headline: string;
  if (e.status === "eliminated") {
    headline = t("groups.tipEliminated");
  } else if (through && e.opponent) {
    headline = t("groups.tipMatchLocked", {
      opponent: e.opponent.name,
      matchLine: matchLine ? ` · ${matchLine}` : "",
    });
  } else if (through && e.slotLocked) {
    headline = t("groups.tipSlotLocked", {
      matchLine: matchLine ?? t("groups.tipTheR32"),
      group: e.facesGroup ?? "",
    });
  } else if (through) {
    headline = t("groups.tipThroughUnfixed");
  } else {
    const s = survival(e, all);
    const frac =
      s.needBelow >= s.swingCount
        ? t("groups.fracAll", { count: s.swingCount })
        : t("groups.fracAtLeast", { need: s.needBelow, total: s.swingCount });
    const pct = forecastPct(e.advanceProb);
    if (s.needBelow <= 0) {
      headline = t("groups.tipSafe", { ordinal: ordinal(e.rank), pct });
    } else if (e.advancing) {
      headline = t("groups.tipHolding", { ordinal: ordinal(e.rank), pct, frac, letters: s.letters });
    } else {
      const dangers = s.dangers.length ? t("groups.tipDangers", { dangers: s.dangers.join(", ") }) : "";
      headline = t("groups.tipBelowCut", { ordinal: ordinal(e.rank), pct, frac, letters: s.letters, dangers });
    }
  }

  // Likely opponents are the group winners this third would face. Redundant when the opponent is already
  // locked, and meaningless once eliminated, so show only otherwise.
  const showOpps = e.status !== "eliminated" && !e.opponent && (e.opponents?.length ?? 0) > 0;

  return (
    <>
      <p className="text-foreground/90 leading-snug">{headline}</p>
      {showOpps && (
        <div className="mt-2.5">
          <div className="text-muted-2 mb-1 font-mono text-[9px] font-semibold tracking-wide uppercase">
            {t("groups.likelyOpponent")}
          </div>
          <ul className="space-y-1">
            {e.opponents!.map((o) => (
              <li key={o.code} className="flex items-center gap-1.5">
                <Flag code={o.code} size={15} />
                <span className="text-foreground/80 min-w-0 flex-1 truncate">{o.name}</span>
                <span className="text-muted-foreground shrink-0 font-mono tabular-nums">{forecastPct(o.prob)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Row({ e, all, t, locale }: { e: ThirdPlaceEntry; all: ThirdPlaceEntry[]; t: TFunction; locale: ReturnType<typeof useLocale> }) {
  const tip = useHoverTip();
  const elim = e.status === "eliminated";
  const through = e.status === "won_group" || e.status === "second" || e.status === "advanced";
  const decided = through && !!e.opponent; // full match locked
  return (
    <tr
      {...tip.triggerProps}
      {...tip.tapProps}
      className={`cursor-help border-l-2 ${e.advancing ? "border-l-contention" : "border-l-transparent"} ${e.rank === 8 ? "border-b-primary/50 border-b border-dashed" : ""} ${elim ? "opacity-45" : ""} hover:bg-muted/20`}
    >
      <td className="text-muted-foreground py-2 pr-1 pl-3 font-mono text-[11px]">{e.rank}</td>
      <td className="py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={localeHref(locale, `/team/${slugForCode(e.code)}`)} className="flex min-w-0 items-center gap-2 hover:underline">
            <Flag code={e.code} size={20} />
            <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${elim ? "line-through" : ""}`}>{e.name}</span>
          </Link>
          <Link href={localeHref(locale, `/group/${e.group.toLowerCase()}`)} className="text-muted-foreground hover:text-primary shrink-0 text-[11px] hover:underline">{t("groups.grpShort", { group: e.group })}</Link>
        </div>
      </td>
      <td className="text-muted-foreground px-1 text-center font-mono text-xs tabular-nums">{e.gf}</td>
      <td className="px-1 text-center font-mono text-xs tabular-nums">{e.gd >= 0 ? "+" : ""}{e.gd}</td>
      <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{e.pts}</td>
      <td className="px-2 pr-3 text-right text-xs tabular-nums">
        {through ? (
          <span className="text-win font-semibold" title={decided ? t("groups.thirdSetTitle") : t("groups.thirdInTitle")}>
            {decided ? t("groups.thirdSet") : t("groups.thirdIn")}
          </span>
        ) : elim ? (
          <span className="text-muted-2">{t("groups.provOut")}</span>
        ) : (
          <ProbMeter p={e.advanceProb} className={`justify-end ${e.advancing ? "text-contention" : "text-muted-foreground"}`} />
        )}
      </td>
      {tip.open && <HoverTipPanel pos={tip.pos}><RowTip e={e} all={all} t={t} /></HoverTipPanel>}
    </tr>
  );
}

export function ThirdPlaceRace({ entries }: { entries: ThirdPlaceEntry[] }) {
  const t = useT();
  const locale = useLocale();
  if (!entries.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold tracking-tight">{t("groups.thirdRaceHeading")}</h2>
      <p className="text-muted-foreground mt-1 mb-3 text-sm">
        {t("groups.thirdRaceIntroLead")} <span className="text-foreground">{t("groups.thirdRaceIntroEightBest")}</span>{" "}
        {t("groups.thirdRaceIntroMid")} <span className="text-foreground">{t("groups.thirdRaceIntroChance")}</span>{" "}
        {t("groups.thirdRaceIntroTail")}
      </p>
      <div className="border-border bg-card overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-border/60 border-b text-[10px] tracking-wide">
              <th className="py-2 pr-1 pl-3 text-left font-medium">{t("groups.thirdColRank")}</th>
              <th className="py-2 text-left font-medium">{t("groups.thirdColTeam")}</th>
              <th className="w-8 px-1 text-center font-medium">{t("groups.colGf")}</th>
              <th className="w-8 px-1 text-center font-medium">{t("groups.colGd")}</th>
              <th className="w-8 px-1 text-center font-semibold">{t("groups.colPts")}</th>
              <th className="px-2 pr-3 text-right font-medium" title={t("groups.thirdColChanceTitle")}>{t("groups.thirdColChance")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => <Row key={e.code} e={e} all={entries} t={t} locale={locale} />)}
          </tbody>
        </table>
      </div>
      <p className="text-muted-2 mt-2 text-xs">
        {t("groups.thirdRaceFootnoteLead")} <span className="text-foreground/80">{t("groups.thirdRaceFootnoteChance")}</span>{" "}
        {t("groups.thirdRaceFootnoteMid")} <span className="text-win">✓</span> {t("groups.thirdRaceFootnoteTail")}
      </p>
    </section>
  );
}
