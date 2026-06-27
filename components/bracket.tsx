"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { teamSlug } from "@/lib/slug";
import { pct, fmtDay } from "@/lib/format";
import { useViewerZone } from "@/lib/useViewerZone";
import { ProbMeter } from "./prob-meter";
import { useT } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref } from "@/lib/i18n/config";

// Column orderings chosen so each match's two feeders are vertically adjacent (top half, then bottom half).
const ORDER: Record<string, number[]> = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF: [97, 98, 99, 100],
  SF: [101, 102],
  FINAL: [104],
};
const ROUNDS = ["R32", "R16", "QF", "SF", "FINAL"] as const;

export function Bracket({
  matches,
  myMatchNumbers = [],
  champion,
}: {
  matches: MatchInfo[];
  myMatchNumbers?: number[];
  champion?: { code: string; name: string; prob: number };
}) {
  const t = useT();
  const byMatch = new Map(matches.map((m) => [m.match, m]));
  const tickets = new Set(myMatchNumbers);

  return (
    <>
      {/* One enclosed, horizontally-scrollable bracket: the border frames the scroll so it reads as
          intentional on desktop, and on mobile the full connected tree is pannable by touch (edge fades
          hint there's more) instead of being flattened into per-round tabs. */}
      <div className="border-border bg-card/20 relative overflow-hidden rounded-2xl border">
        <div className="overflow-x-auto overscroll-x-contain p-3 sm:p-4 [scrollbar-width:thin] [mask-image:linear-gradient(to_right,transparent,#000_1.25rem,#000_calc(100%-1.25rem),transparent)] md:[mask-image:none]">
          <div className="flex min-w-[1100px] items-stretch">
            {ROUNDS.map((round, ri) => (
              <Fragment key={round}>
                <div className="flex min-w-[168px] flex-1 flex-col">
                  <div className="text-muted-foreground mb-3 h-4 px-1 font-mono text-[10px] font-semibold tracking-wide uppercase">
                    {t(`rounds.${round}`)}
                  </div>
                  {round === "FINAL" && champion && <ChampionCard champion={champion} />}
                  <div className="flex flex-1 flex-col gap-y-2.5">
                    {ORDER[round].map((mn) => {
                      const m = byMatch.get(mn);
                      return (
                        <div key={mn} className="flex flex-1 items-center">
                          {m && <Node m={m} hasTicket={tickets.has(mn)} final={round === "FINAL"} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {ri < ROUNDS.length - 1 && <Connectors count={ORDER[ROUNDS[ri + 1]].length} />}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <p className="text-muted-2 mt-2 text-center text-xs md:hidden">{t("bracket.swipeHint")}</p>
    </>
  );
}

// The climax of the FINAL column: the model's projected champion, so the right edge of the bracket
// resolves to a clear terminus instead of an empty column under the "Final" header.
function ChampionCard({ champion }: { champion: { code: string; name: string; prob: number } }) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="border-primary/40 bg-primary/[0.07] mb-3 rounded-xl border p-3 text-center">
      <div className="text-primary mb-1.5 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("bracket.projectedChampion")}</div>
      <Link href={localeHref(locale, `/team/${teamSlug(champion.name)}`)} className="flex items-center justify-center gap-2 hover:underline">
        <Flag code={champion.code} size={22} />
        <span className="font-semibold">{champion.name}</span>
      </Link>
      <div className="text-primary mt-1 font-mono text-sm font-bold tabular-nums">{pct(Math.min(champion.prob, 0.99))}</div>
    </div>
  );
}

// A column of "⊐" brackets, one per next-round match. With uniform node heights, each
// bracket's top/bottom edges land exactly on its two feeders' centers and its right edge
// meets the target node — turning the columns into a connected tree.
function Connectors({ count }: { count: number }) {
  return (
    <div className="flex w-4 shrink-0 flex-col">
      <div className="mb-3 h-4" />
      {/* gap-y matches the node columns so each ⊐ bracket stays centered on its two feeders' midpoint. */}
      <div className="flex flex-1 flex-col gap-y-2.5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div className="border-muted-foreground/45 h-1/2 w-full rounded-r-md border-t border-r border-b" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ m, hasTicket, big, final }: { m: MatchInfo; hasTicket: boolean; big?: boolean; final?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const { zone } = useViewerZone();
  // Uniform min-height keeps every node the same size, so the flex slots divide each column evenly and the
  // ⊐ connectors land on feeder centers. The matchup is vertically centred to absorb the spare height.
  return (
    <Link
      href={localeHref(locale, `/match/${m.match}`)}
      className={`bg-card hover:bg-muted/30 flex min-h-[124px] w-full flex-col rounded-xl border transition-colors ${big ? "text-sm" : "text-xs"} ${
        final
          ? "border-primary/45 ring-primary/15 bg-primary/[0.04] ring-1"
          : hasTicket
            ? "border-contention/50"
            : "border-border"
      }`}
    >
      <div className={`flex items-center justify-between gap-1 ${final ? "text-primary/90" : "text-muted-foreground"} ${big ? "px-2.5 pt-2 pb-1 text-[10px]" : "px-2 pt-1.5 pb-1 text-[9px]"}`}>
        <span className="truncate" suppressHydrationWarning>{final ? t("rounds.FINAL") : `M${m.match}`} · {fmtDay(m.utc, zone)}<span className="hidden sm:inline"> · {m.city}</span></span>
        {hasTicket && (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" className="text-contention shrink-0" aria-label={t("bracket.youHaveTickets")}>
            <path d="M6 3a2 2 0 0 0-2 2v15l8-4 8 4V5a2 2 0 0 0-2-2H6Z" />
          </svg>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <Side m={m} side="home" big={big} />
        <div className="border-border border-t" />
        <Side m={m} side="away" big={big} />
      </div>
    </Link>
  );
}

function Side({ m, side, big }: { m: MatchInfo; side: "home" | "away"; big?: boolean }) {
  const t = useT();
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const cands = (side === "home" ? m.projHome : m.projAway) ?? [];
  const third = !!slot?.startsWith("3:");

  // CONFIRMED — a clinched team or a played result. Rendered EDITORIAL: bigger flag, bold name, a green ✓
  // (or the score), so a locked slot reads as settled against the smaller "race" on the other side.
  if (resolved) {
    const played = m.status === "final";
    const score = side === "home" ? m.homeScore : m.awayScore;
    const isWinner = played && !!m.winner && m.winner === resolved;
    const isLoser = played && !!m.winner && m.winner !== resolved;
    const onPens = played && m.homeScore != null && m.homeScore === m.awayScore;
    return (
      <div className={`flex items-center ${big ? "gap-2.5 px-3 py-2.5" : "gap-2 px-2.5 py-2"}`}>
        <Flag code={resolved} size={big ? 24 : 20} />
        <span className={`min-w-0 flex-1 truncate ${big ? "text-sm" : "text-[13px]"} ${isLoser ? "text-muted-foreground" : "font-semibold"}`}>{name}</span>
        {played ? (
          <span className="flex shrink-0 items-center gap-1">
            {isWinner && onPens && <span className="text-win/70 font-mono text-[8px] font-semibold tracking-wide uppercase" title={t("bracket.wonOnPenalties")}>{t("bracket.pens")}</span>}
            <span className={`font-mono font-bold tabular-nums ${big ? "text-sm" : "text-xs"} ${isWinner ? "text-win" : "text-muted-foreground"}`}>{score}</span>
          </span>
        ) : (
          <span className={`shrink-0 font-bold text-win ${big ? "text-sm" : "text-xs"}`} title={t("bracket.confirmed")}>✓</span>
        )}
      </div>
    );
  }

  // UNCONFIRMED — surface the RACE for this slot inline (no hover): the top contenders with their fill %,
  // rendered small/secondary so a settled team opposite reads as the bigger, editorial one. A near-locked
  // slot (one candidate dominant) naturally collapses to a single row.
  // Top 2 contenders in the bracket (the full top-4 with bars lives on the match page) — keeps node heights
  // uniform so the connector tree stays aligned.
  const shown = cands.filter((c) => c.prob >= 0.05).slice(0, 2);
  const list = shown.length ? shown : cands.slice(0, 1);
  if (list.length === 0) {
    return (
      <div className={`flex items-center ${big ? "gap-2.5 px-3 py-2.5" : "gap-2 px-2.5 py-2"}`}>
        <span className={`bg-muted/30 shrink-0 rounded-[3px] ${big ? "size-6" : "size-[18px]"}`} aria-hidden />
        <span className="text-muted-2 text-xs">{t("common.tbd")}</span>
      </div>
    );
  }
  return (
    <div className={`${big ? "space-y-1.5 px-3 py-2" : "space-y-1 px-2.5 py-1.5"}`}>
      {list.map((c) => {
        return (
          <div key={c.code} className="flex items-center gap-1.5">
            <Flag code={c.code} size={big ? 16 : 14} />
            {third && <span className="text-muted-2 font-mono text-[8px] font-semibold tracking-wide uppercase" title={t("bracket.thirdPlacedTeam")}>{t("rounds.shortThird")}</span>}
            <span className={`text-foreground/70 min-w-0 flex-1 truncate ${big ? "text-xs" : "text-[11px]"}`}>{c.name}</span>
            <ProbMeter p={c.prob} width={big ? 30 : 22} className={`text-muted-foreground shrink-0 ${big ? "text-xs" : "text-[10px]"}`} />
          </div>
        );
      })}
    </div>
  );
}
