"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { MatchInfo } from "@/lib/predictions";
import { Flag } from "./flag";
import { slugForCode } from "@/lib/slug";
import { pct, fmtDay, fmtTimeShort } from "@/lib/format";
import { fifaCity } from "@/lib/venues";
import { decidedOnPens, pensScore } from "@/lib/penalties";
import { useViewerZone } from "@/lib/useViewerZone";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref } from "@/lib/i18n/config";

// Two DISTINCT probability languages, never conflated:
//   • RACE (an open slot) — each contender's chance of REACHING this slot, as a background fill behind the
//     name (multiple contenders, they don't sum to 100%).
//   • WIN-SPLIT (a decided tie) — the two known teams' chance of WINNING this match, as one two-colour bar
//     that sums to 100%.
// Different shapes → different meanings, so "chance to get here" is never misread as "chance to win".
const mix = (color: string, p: number) => `color-mix(in oklab, ${color} ${p}%, transparent)`;

// A scheduled tie whose kickoff has already passed — the result just isn't in the feed yet (data lag), so it
// must not read as a crisp upcoming fixture. Kept out of the render body so the component stays pure.
const kickoffPassed = (utc: string) => Date.parse(utc) < Date.now();

// Column orderings chosen so each match's two feeders are vertically adjacent (top half, then bottom half).
const ORDER: Record<string, number[]> = {
  R32: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  R16: [89, 90, 93, 94, 91, 92, 95, 96],
  QF: [97, 98, 99, 100],
  SF: [101, 102],
  FINAL: [104],
};
const ROUNDS = ["R32", "R16", "QF", "SF", "FINAL"] as const;

// Every team a node touches — resolved sides plus, for an open slot, its candidate pool — so hovering any team
// can light up every node on its road through the tree.
function nodeTeams(m: MatchInfo): string[] {
  const out: string[] = [];
  if (m.home) out.push(m.home);
  else for (const c of m.projHome ?? []) out.push(c.code);
  if (m.away) out.push(m.away);
  else for (const c of m.projAway ?? []) out.push(c.code);
  return out;
}

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
  // The signature interaction: hover any team to trace its road — the tree recedes and that team's path lights
  // up across every round. Cleared the instant the pointer leaves a team (per-row onMouseLeave), so it never
  // sticks.
  const [hovered, setHovered] = useState<string | null>(null);

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
                          {m && <Node m={m} hasTicket={tickets.has(mn)} final={round === "FINAL"} championCode={champion?.code} hovered={hovered} onHover={setHovered} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {ri < ROUNDS.length - 1 && <Connectors count={ORDER[ROUNDS[ri + 1]].length} />}
              </Fragment>
            ))}
            {champion && (
              <>
                <div className="flex w-6 shrink-0 flex-col">
                  <div className="mb-3 h-4" />
                  <div className="flex flex-1 items-center"><div className="border-muted-foreground/45 w-full border-t" /></div>
                </div>
                <div className="flex min-w-[150px] flex-1 flex-col">
                  <div className="mb-3 h-4" />
                  <div className="flex flex-1 flex-col justify-center">
                    <ChampionCard champion={champion} hovered={hovered} onHover={setHovered} />
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

function ChampionCard({ champion, hovered, onHover }: { champion: { code: string; name: string; prob: number; won?: boolean }; hovered: string | null; onHover: (c: string | null) => void }) {
  const t = useT();
  const locale = useLocale();
  const won = champion.won;
  const on = hovered === champion.code;
  const off = hovered != null && hovered !== champion.code;
  return (
    <div
      onMouseEnter={() => onHover(champion.code)}
      onMouseLeave={() => onHover(null)}
      className={`rounded-xl border p-3 text-center transition-[opacity,box-shadow] ${off ? "opacity-40" : ""} ${
        won ? "border-contention/45 bg-contention/[0.08]" : "border-primary/40 bg-primary/[0.07]"
      } ${on ? "ring-1 ring-primary/60" : ""}`}
    >
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

function Connectors({ count }: { count: number }) {
  return (
    <div className="flex w-6 shrink-0 flex-col">
      <div className="mb-3 h-4" />
      <div className="flex flex-1 flex-col gap-y-2.5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div className="flex h-1/2 w-full items-center">
              <div className="border-muted-foreground/45 h-full w-1/2 rounded-e-md border-t border-e border-b" />
              <div className="border-muted-foreground/45 w-1/2 border-t" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Node({ m, hasTicket, big, final, championCode, hovered, onHover }: { m: MatchInfo; hasTicket: boolean; big?: boolean; final?: boolean; championCode?: string; hovered: string | null; onHover: (c: string | null) => void }) {
  const t = useT();
  const locale = useLocale();
  const { zone } = useViewerZone();
  const nodeHit = hovered != null && nodeTeams(m).includes(hovered);
  // A decided-but-unplayed tie: both teams known, not kicked off. This is the "match card" state — it carries
  // the kickoff date+time and the win-split. (A played tie shows the score; a partly-open tie shows the race.)
  const decidedTie = m.status === "scheduled" && !!m.home && !!m.away;
  return (
    <Link
      href={localeHref(locale, `/match/${m.match}`)}
      className={`bg-card hover:bg-muted/30 flex min-h-[124px] w-full flex-col rounded-xl border transition-[background-color,border-color,box-shadow,transform] hover:-translate-y-px hover:shadow-lg hover:shadow-black/20 ${big ? "text-sm" : "text-xs"} ${
        nodeHit
          ? "border-primary/60 ring-1 ring-primary/25"
          : final
            ? "border-primary/45 ring-primary/15 bg-primary/[0.04] ring-1"
            : hasTicket
              ? "border-contention/50"
              : "border-border hover:border-primary/40"
      }`}
    >
      <div className={`flex items-center justify-between gap-1 ${final ? "text-primary/90" : "text-muted-foreground"} ${big ? "px-2.5 pt-2 pb-1 text-[10px]" : "px-2 pt-1.5 pb-1 text-[9px]"}`}>
        {/* A decided tie shows the day+time down in the body as a proper kickoff line, so its header carries
            just the venue; every other state keeps the day (and city) in the header. */}
        <span className="truncate" suppressHydrationWarning>
          {final ? t("rounds.FINAL") : `M${m.match}`}
          {decidedTie ? <> · {fifaCity(m.venue, m.city)}</> : <> · {fmtDay(m.utc, zone)}<span className="hidden sm:inline"> · {fifaCity(m.venue, m.city)}</span></>}
        </span>
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

      {decidedTie ? (
        <DecidedTie m={m} big={big} championCode={championCode} zone={zone} hovered={hovered} onHover={onHover} t={t} />
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <Side m={m} side="home" big={big} championCode={championCode} hovered={hovered} onHover={onHover} />
          <div className="border-border border-t" />
          <Side m={m} side="away" big={big} championCode={championCode} hovered={hovered} onHover={onHover} />
        </div>
      )}
    </Link>
  );
}

// A decided (both teams known), unplayed tie — a proper match card: the two teams with a WIN-the-tie split bar
// between them (its own shape, so it never reads as the reach-% race), and a kickoff date+time line.
function DecidedTie({ m, big, championCode, zone, hovered, onHover, t }: { m: MatchInfo; big?: boolean; championCode?: string; zone: import("@/lib/format").Zone | undefined; hovered: string | null; onHover: (c: string | null) => void; t: TFunction }) {
  const h = m.advance?.home;
  const a = m.advance?.away;
  const px = big ? "px-3" : "px-2.5";
  return (
    <div className={`flex flex-1 flex-col justify-center gap-1 py-1.5 ${px}`}>
      <TieTeam code={m.home!} name={m.homeName ?? m.home!} winProb={h} isChamp={m.home === championCode} big={big} hovered={hovered} onHover={onHover} />
      {h != null && a != null ? (
        <div className="my-0.5 flex h-1.5 gap-[2px]" aria-hidden>
          <span className="bg-primary min-w-[3px] rounded-full" style={{ width: `${h * 100}%` }} />
          <span className="bg-data-cool min-w-[3px] rounded-full" style={{ width: `${a * 100}%` }} />
        </div>
      ) : (
        <div className="border-border my-1 border-t" />
      )}
      <TieTeam code={m.away!} name={m.awayName ?? m.away!} winProb={a} isChamp={m.away === championCode} big={big} hovered={hovered} onHover={onHover} />
      <div className="mt-1 flex items-center justify-center gap-1.5" suppressHydrationWarning>
        {kickoffPassed(m.utc) ? (
          // Kicked off already, result not in yet — honest "awaiting result", not a future kickoff.
          <span className="text-muted-2 font-mono text-[10px] font-semibold tracking-wide uppercase">{t("bracket.awaitingResult")}</span>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-2 shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5V12l3 1.5" />
            </svg>
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums whitespace-nowrap">{fmtDay(m.utc, zone)} · {fmtTimeShort(m.utc, zone)}</span>
          </>
        )}
      </div>
    </div>
  );
}

// One team in a decided tie: flag + name + its win-the-tie %. The favourite reads bolder; both take part in
// the hover road-trace (highlight when hovered, dim when another team is traced).
function TieTeam({ code, name, winProb, isChamp, big, hovered, onHover }: { code: string; name: string; winProb?: number; isChamp?: boolean; big?: boolean; hovered: string | null; onHover: (c: string | null) => void }) {
  const on = hovered === code;
  const off = hovered != null && hovered !== code;
  const fav = winProb != null && winProb >= 0.5;
  return (
    <div
      onMouseEnter={() => onHover(code)}
      onMouseLeave={() => onHover(null)}
      className={`flex items-center gap-2 rounded px-1 transition-[opacity] ${off ? "opacity-30" : ""} ${on ? "ring-1 ring-primary/70 ring-inset" : ""}`}
    >
      <Flag code={code} size={big ? 22 : 18} />
      <span className={`min-w-0 flex-1 truncate ${big ? "text-sm" : "text-[13px]"} ${fav ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{name}</span>
      {winProb != null && (
        <span className={`shrink-0 font-mono tabular-nums ${big ? "text-sm" : "text-xs"} ${on || (isChamp && hovered == null) ? "text-primary font-semibold" : fav ? "text-foreground font-semibold" : "text-muted-2"}`}>{pct(Math.min(winProb, 0.99))}</span>
      )}
    </div>
  );
}

function Side({ m, side, big, championCode, hovered, onHover }: { m: MatchInfo; side: "home" | "away"; big?: boolean; championCode?: string; hovered: string | null; onHover: (c: string | null) => void }) {
  const t = useT();
  const resolved = side === "home" ? m.home : m.away;
  const name = side === "home" ? m.homeName : m.awayName;
  const slot = side === "home" ? m.slotHome : m.slotAway;
  const cands = (side === "home" ? m.projHome : m.projAway) ?? [];
  const third = !!slot?.startsWith("3:");

  if (resolved) {
    const played = m.status === "final";
    const live = m.status === "live";
    const on = hovered === resolved;
    const off = hovered != null && hovered !== resolved;

    // PLAYED / LIVE — the score is the fact (still hoverable so a team's road lights up along with the rest).
    if (played || live) {
      const score = side === "home" ? m.homeScore : m.awayScore;
      const isWinner = played && !!m.winner && m.winner === resolved;
      const isLoser = played && !!m.winner && m.winner !== resolved;
      const onPens = decidedOnPens(m);
      const ps = pensScore(m);
      const pen = side === "home" ? m.homePens : m.awayPens;
      return (
        <div
          onMouseEnter={() => onHover(resolved)}
          onMouseLeave={() => onHover(null)}
          className={`flex items-center transition-[opacity] ${big ? "gap-2.5 px-3 py-2.5" : "gap-2 px-2.5 py-2"} ${off ? "opacity-30" : ""} ${on ? "bg-primary/5" : ""}`}
        >
          <Flag code={resolved} size={big ? 24 : 20} />
          <span className={`min-w-0 flex-1 truncate ${big ? "text-sm" : "text-[13px]"} ${isLoser ? "text-muted-foreground line-through" : "font-semibold"}`}>{name}</span>
          {played ? (
            <span className="flex shrink-0 items-center gap-1">
              <span className={`font-mono font-bold tabular-nums ${big ? "text-sm" : "text-xs"} ${isWinner ? "text-win" : "text-muted-foreground"}`}>{score}</span>
              {onPens && ps != null && (
                <span className={`font-mono text-[10px] tabular-nums ${isWinner ? "text-win/80" : "text-muted-foreground/70"}`} title={t("common.wonOnPenalties")}>({pen})</span>
              )}
              {onPens && ps == null && isWinner && (
                <span className="text-win/70 font-mono text-[9px] font-semibold tracking-wide uppercase" title={t("common.wonOnPenalties")}>{t("common.pens")}</span>
              )}
            </span>
          ) : (
            <span className={`text-foreground shrink-0 font-mono font-bold tabular-nums ${big ? "text-sm" : "text-xs"}`}>{score}</span>
          )}
        </div>
      );
    }

    // CONFIRMED into a still-forming tie (the OTHER side is a race, so the opponent — and any win% — is TBD).
    // A clinch is a FACT, not a forecast: no %, just the settled team.
    return (
      <div
        onMouseEnter={() => onHover(resolved)}
        onMouseLeave={() => onHover(null)}
        className={`flex items-center transition-[opacity] ${big ? "gap-2.5 px-3 py-2.5" : "gap-2 px-2.5 py-2"} ${off ? "opacity-30" : ""} ${on ? "bg-primary/5" : ""}`}
      >
        <Flag code={resolved} size={big ? 24 : 20} />
        <span className={`min-w-0 flex-1 truncate font-semibold ${big ? "text-sm" : "text-[13px]"}`}>{name}</span>
      </div>
    );
  }

  // UNCONFIRMED — the RACE for this slot: the top-3 contenders by chance of REACHING this match, each a
  // background-fill row. Capped at 3 so node heights stay uniform and the connector tree stays aligned.
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
      {list.map((c, i) => (
        <RaceRow key={c.code} code={c.code} name={c.name} prob={c.prob} rank={i} road={i === 0 && c.code === championCode} third={third} big={big} hovered={hovered} onHover={onHover} t={t} />
      ))}
    </div>
  );
}

// One contender in an open slot's race — its chance of REACHING here, drawn as a background fill behind the
// name (the treatment that reads as "the race for the place", distinct from the win-split of a decided tie).
function RaceRow({ code, name, prob, rank, road, third, big, hovered, onHover, t }: { code: string; name: string; prob: number; rank: number; road: boolean; third?: boolean; big?: boolean; hovered: string | null; onHover: (c: string | null) => void; t: TFunction }) {
  const on = hovered === code;
  const off = hovered != null && hovered !== code;
  const lead = rank === 0;
  const roadActive = road && hovered == null;
  const w = Math.max(3, Math.min(prob, 0.99) * 100);
  const fill = on ? mix("var(--primary)", 28) : roadActive ? mix("var(--primary)", 22) : lead ? mix("var(--foreground)", 13) : mix("var(--foreground)", 5);
  return (
    <div
      onMouseEnter={() => onHover(code)}
      onMouseLeave={() => onHover(null)}
      className={`relative flex items-center overflow-hidden rounded transition-[opacity] ${off ? "opacity-30" : ""} ${on ? "ring-1 ring-primary/70 ring-inset" : ""}`}
    >
      <span className="absolute inset-y-0 left-0 transition-[width,background-color] duration-500" style={{ width: `${w}%`, backgroundColor: fill }} aria-hidden />
      <span className="relative flex w-full items-center gap-1.5 px-1 py-0.5">
        <Flag code={code} size={lead ? (big ? 16 : 14) : big ? 14 : 12} />
        {third && lead && <span className="text-muted-2 shrink-0 font-mono text-[8px] font-semibold tracking-wide uppercase" title={t("bracket.thirdPlacedTeam")}>{t("rounds.shortThird")}</span>}
        <span className={`min-w-0 flex-1 truncate ${lead ? "text-foreground text-[13px] font-semibold" : rank === 1 ? "text-muted-foreground text-[11px]" : "text-muted-2 text-[11px]"}`}>{name}</span>
        <span className={`shrink-0 font-mono tabular-nums ${on || roadActive ? "text-primary text-[11px] font-semibold" : lead ? "text-foreground/90 text-[11px] font-semibold" : "text-muted-2 text-[10px]"}`}>{pct(Math.min(prob, 0.99))}</span>
      </span>
    </div>
  );
}
