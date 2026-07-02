"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { slugForCode } from "@/lib/slug";
import { pct, fmtDay } from "@/lib/format";
import { fifaCity } from "@/lib/venues";
import { decidedOnPens, pensScore } from "@/lib/penalties";
import { useViewerZone } from "@/lib/useViewerZone";
import { useT } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref } from "@/lib/i18n/config";

// Probability shown as a subtle background fill behind each candidate row (shared visual language with the
// calendar's slot-likelihood styling), rather than a separate meter.
const mix = (color: string, p: number) => `color-mix(in oklab, ${color} ${p}%, transparent)`;

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
  champion?: { code: string; name: string; prob: number; won?: boolean };
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
          <div dir="ltr" className="flex min-w-[1200px] items-stretch">
            {ROUNDS.map((round, ri) => (
              <Fragment key={round}>
                <div className="flex min-w-[168px] flex-1 flex-col">
                  <div className="text-muted-foreground mb-3 h-4 px-1 font-mono text-[10px] font-semibold tracking-wide uppercase">
                    {t(`rounds.${round}`)}
                  </div>
                  <div className="flex flex-1 flex-col gap-y-2.5">
                    {ORDER[round].map((mn) => {
                      const m = byMatch.get(mn);
                      return (
                        <div key={mn} className="flex flex-1 items-center">
                          {m && <Node m={m} hasTicket={tickets.has(mn)} final={round === "FINAL"} championCode={champion?.code} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {ri < ROUNDS.length - 1 && <Connectors count={ORDER[ROUNDS[ri + 1]].length} />}
              </Fragment>
            ))}
            {/* The champion is its own terminus column to the right of the FINAL — a connector links the
                final node to it, and it sits vertically centered on the final (no longer crammed above it). */}
            {champion && (
              <>
                {/* FINAL -> champion is 1-to-1, so a plain short horizontal line (not the merge bracket). */}
                <div className="flex w-6 shrink-0 flex-col">
                  <div className="mb-3 h-4" />
                  <div className="flex flex-1 items-center"><div className="border-muted-foreground/45 w-full border-t" /></div>
                </div>
                <div className="flex min-w-[150px] flex-1 flex-col">
                  <div className="mb-3 h-4" />
                  <div className="flex flex-1 flex-col justify-center">
                    <ChampionCard champion={champion} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="text-muted-2 mt-2 text-center text-xs md:hidden">{t("bracket.swipeHint")}</p>
    </>
  );
}

// The climax of the bracket: the model's projected champion, in its own terminus column to the right of
// the FINAL, vertically centred on the final node.
function ChampionCard({ champion }: { champion: { code: string; name: string; prob: number; won?: boolean } }) {
  const t = useT();
  const locale = useLocale();
  // Once the tournament's over this is the actual winner — gold, "Champion", no probability.
  const won = champion.won;
  return (
    <div className={`rounded-xl border p-3 text-center ${won ? "border-contention/45 bg-contention/[0.08]" : "border-primary/40 bg-primary/[0.07]"}`}>
      <div className={`mb-1.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${won ? "text-contention" : "text-primary"}`}>{won ? t("bracket.champion") : t("bracket.projectedChampion")}</div>
      <Link href={localeHref(locale, `/team/${slugForCode(champion.code)}`)} className="flex items-center justify-center gap-2 hover:underline">
        <Flag code={champion.code} size={22} />
        <span className="font-semibold">{champion.name}</span>
      </Link>
      {won ? (
        <div className="text-contention mt-1 inline-flex items-center justify-center gap-1 font-mono text-[11px] font-semibold tracking-wide uppercase">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5 10 17.5 19 7" /></svg>
          {t("bracket.winner")}
        </div>
      ) : (
        <div className="text-primary mt-1 font-mono text-sm font-bold tabular-nums">{pct(Math.min(champion.prob, 0.99))}</div>
      )}
    </div>
  );
}

// A column of bracket connectors, one per next-round match. Each merges the two feeders into a centre
// vertical, then a short horizontal lead-out to the target card — so the target gets a clean horizontal tip
// on its left (mirroring the lines on its right), not a vertical running down its whole edge.
function Connectors({ count }: { count: number }) {
  return (
    <div className="flex w-6 shrink-0 flex-col">
      <div className="mb-3 h-4" />
      {/* gap-y matches the node columns so each bracket stays centered on its two feeders' midpoint. */}
      <div className="flex flex-1 flex-col gap-y-2.5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div className="flex h-1/2 w-full items-center">
              {/* feeders -> centre vertical */}
              <div className="border-muted-foreground/45 h-full w-1/2 rounded-e-md border-t border-e border-b" />
              {/* centre -> target card: a clean horizontal tip */}
              <div className="border-muted-foreground/45 w-1/2 border-t" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ m, hasTicket, big, final, championCode }: { m: MatchInfo; hasTicket: boolean; big?: boolean; final?: boolean; championCode?: string }) {
  const t = useT();
  const locale = useLocale();
  const { zone } = useViewerZone();
  // Uniform min-height keeps every node the same size, so the flex slots divide each column evenly and the
  // connectors land on feeder centers. The matchup is vertically centred to absorb the spare height.
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
        <span className="truncate" suppressHydrationWarning>{final ? t("rounds.FINAL") : `M${m.match}`} · {fmtDay(m.utc, zone)}<span className="hidden sm:inline"> · {fifaCity(m.venue, m.city)}</span></span>
        <span className="flex shrink-0 items-center gap-1.5">
          {m.status === "live" ? (
            <span className="text-live inline-flex items-center gap-1 font-semibold"><span className="bg-live size-1 animate-pulse rounded-full" />{m.liveDetail}</span>
          ) : m.status === "final" ? (
            <span className="text-win font-semibold">{t("scoreTicker.ft")}</span>
          ) : null}
          {hasTicket && (
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" className="text-contention" aria-label={t("bracket.youHaveTickets")}>
              <path d="M6 3a2 2 0 0 0-2 2v15l8-4 8 4V5a2 2 0 0 0-2-2H6Z" />
            </svg>
          )}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <Side m={m} side="home" big={big} championCode={championCode} />
        <div className="border-border border-t" />
        <Side m={m} side="away" big={big} championCode={championCode} />
      </div>
    </Link>
  );
}

function Side({ m, side, big, championCode }: { m: MatchInfo; side: "home" | "away"; big?: boolean; championCode?: string }) {
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
    const live = m.status === "live";
    const score = side === "home" ? m.homeScore : m.awayScore;
    const isWinner = played && !!m.winner && m.winner === resolved;
    const isLoser = played && !!m.winner && m.winner !== resolved;
    const onPens = decidedOnPens(m);
    const ps = pensScore(m); // shootout tally, once known
    const pen = side === "home" ? m.homePens : m.awayPens;
    return (
      <div className={`flex items-center ${big ? "gap-2.5 px-3 py-2.5" : "gap-2 px-2.5 py-2"}`}>
        <Flag code={resolved} size={big ? 24 : 20} />
        <span className={`min-w-0 flex-1 truncate ${big ? "text-sm" : "text-[13px]"} ${isLoser ? "text-muted-foreground line-through" : "font-semibold"}`}>{name}</span>
        {played ? (
          <span className="flex shrink-0 items-center gap-1">
            <span className={`font-mono font-bold tabular-nums ${big ? "text-sm" : "text-xs"} ${isWinner ? "text-win" : "text-muted-foreground"}`}>{score}</span>
            {/* Shootout: the pen tally per side (e.g. "1 (4)"), winner-tinted. Before the tally lands, a
                "pens" badge on the winner still flags how the tie was settled. */}
            {onPens && ps != null && (
              <span className={`font-mono text-[10px] tabular-nums ${isWinner ? "text-win/80" : "text-muted-foreground/70"}`} title={t("common.wonOnPenalties")}>({pen})</span>
            )}
            {onPens && ps == null && isWinner && (
              <span className="text-win/70 font-mono text-[9px] font-semibold tracking-wide uppercase" title={t("common.wonOnPenalties")}>{t("common.pens")}</span>
            )}
          </span>
        ) : live ? (
          // In progress: show the current goals (no winner highlight yet — undecided until full time).
          <span className={`text-foreground shrink-0 font-mono font-bold tabular-nums ${big ? "text-sm" : "text-xs"}`}>{score}</span>
        ) : (
          <span className={`shrink-0 font-bold text-win ${big ? "text-sm" : "text-xs"}`} title={t("bracket.confirmed")}>✓</span>
        )}
      </div>
    );
  }

  // UNCONFIRMED — surface the RACE for this slot inline (no hover): the top-3 contenders with the probability
  // of reaching this match rendered as a subtle background fill + lead/2nd/3rd hierarchy (shared styling with
  // the calendar). Capped at 3 rows so node heights stay uniform and the connector tree stays aligned.
  const shown = cands.filter((c) => c.prob >= 0.05);
  const list = (shown.length ? shown : cands.slice(0, 1)).slice(0, 3);
  if (list.length === 0) {
    return (
      <div className={`flex items-center ${big ? "gap-2.5 px-3 py-2.5" : "gap-2 px-2.5 py-2"}`}>
        <span className={`bg-muted/30 shrink-0 rounded-[3px] ${big ? "size-6" : "size-[18px]"}`} aria-hidden />
        <span className="text-muted-2 text-xs">{t("common.tbd")}</span>
      </div>
    );
  }
  return (
    <div className={`space-y-px ${big ? "px-2.5 py-1.5" : "px-2 py-1"}`}>
      {list.map((c, i) => {
        const lead = i === 0;
        // The projected champion leads every slot on its road to the final (payload guarantees the ordering);
        // tint that row pitch-green so it reads as the champion's road — one green thread through the tree to
        // the champion card — even where a rival's reach-% is a hair higher.
        const road = lead && c.code === championCode;
        const w = Math.max(3, Math.min(c.prob, 0.99) * 100);
        return (
          <div key={c.code} className="relative flex items-center overflow-hidden rounded">
            <span className="absolute inset-y-0 left-0" style={{ width: `${w}%`, backgroundColor: mix(road ? "var(--primary)" : "var(--foreground)", road ? 22 : lead ? 13 : 5) }} aria-hidden />
            <span className="relative flex w-full items-center gap-1.5 px-0.5 py-0.5">
              <Flag code={c.code} size={lead ? (big ? 16 : 14) : big ? 14 : 12} />
              {third && lead && <span className="text-muted-2 shrink-0 font-mono text-[8px] font-semibold tracking-wide uppercase" title={t("bracket.thirdPlacedTeam")}>{t("rounds.shortThird")}</span>}
              <span className={`min-w-0 flex-1 truncate ${lead ? "text-foreground text-[13px] font-semibold" : i === 1 ? "text-muted-foreground text-[11px]" : "text-muted-2 text-[11px]"}`}>{c.name}</span>
              <span className={`shrink-0 font-mono tabular-nums ${road ? "text-primary text-[11px] font-semibold" : lead ? "text-foreground/90 text-[11px] font-semibold" : "text-muted-2 text-[10px]"}`}>{pct(Math.min(c.prob, 0.99))}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
