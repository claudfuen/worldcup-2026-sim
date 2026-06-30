"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag } from "@/components/flag";
import { useT } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/client";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { playerSlug } from "@/lib/players";
import type { MatchEvent } from "@/lib/matchEvents";

type T = ReturnType<typeof useT>;

// Placeholder slotted into a translated "assist: {name}" / "off: {name}" line so we can render JUST the name
// as a link (locale-agnostic — works wherever {name} sits in the sentence). Private-use char, never in data.
const NAME_SLOT = "";

// A player's name, linked to their page when we can resolve a team code (every timeline participant has a
// page — see aggregatePlayers). Falls back to plain text for the rare unresolved-team event.
function PlayerName({ name, code, locale, className }: { name: string; code: string | null; locale: Locale; className?: string }) {
  if (!code) return <span className={className}>{name}</span>;
  return (
    <Link href={localeHref(locale, `/player/${playerSlug(name, code)}`)} className={`${className ?? ""} hover:underline`}>
      {name}
    </Link>
  );
}

// Render a translated template that contains a single linked name (e.g. "assist: <Name>").
function LinkedLine({ template, name, code, locale }: { template: string; name: string; code: string | null; locale: Locale }) {
  const [before, after = ""] = template.split(NAME_SLOT);
  return (
    <>
      {before}
      <PlayerName name={name} code={code} locale={locale} />
      {after}
    </>
  );
}

// The match's goals / cards / substitutions as a centered timeline: a vertical spine carries the minute and
// the running score, with each event on its own team's side (home left, away right). Team headers anchor the
// sides, proper icons make each type read at a glance. Substitutions are hidden by default (they add a lot of
// rows) behind a top-right toggle, keeping the default view focused on goals + cards. Live + completed.
export function MatchTimeline({
  events, homeCode, awayCode, homeName, awayName, final = false, scored = false, playerImages,
}: {
  events: MatchEvent[];
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  final?: boolean; // match is over
  scored?: boolean; // at least one goal was scored — distinguishes "0-0, nothing happened" from "feed has no detail"
  playerImages?: Record<string, string>; // "teamCode|name" -> headshot URL (server-resolved, optional)
}) {
  const t = useT();
  const locale = useLocale();
  const [showSubs, setShowSubs] = useState(false);
  const hasSubs = events.some((e) => e.kind === "sub");

  // Running score after each goal (own goals count for the opponent) — computed over ALL events so it stays
  // correct regardless of the subs toggle (subs never change the score).
  let h = 0, a = 0;
  const rows = events.map((e) => {
    const beneficiary = e.kind === "goal" && e.goalType === "own" ? (e.teamCode === homeCode ? awayCode : homeCode) : e.teamCode;
    let score: string | null = null;
    if (e.kind === "goal") {
      if (beneficiary === homeCode) h++;
      else if (beneficiary === awayCode) a++;
      score = `${h}–${a}`;
    }
    return { e, score, onHome: beneficiary === homeCode };
  });
  const shown = rows.filter((r) => showSubs || r.e.kind !== "sub");

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("match.timeline")}</h2>
        {hasSubs && (
          <button
            type="button"
            onClick={() => setShowSubs((v) => !v)}
            aria-pressed={showSubs}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-semibold tracking-wide uppercase transition-colors ${
              showSubs ? "border-primary/40 text-primary" : "border-border text-muted-2 hover:text-foreground"
            }`}
          >
            <SubIcon label="" />
            {showSubs ? t("match.hideSubs") : t("match.showSubs")}
          </button>
        )}
      </div>
      <div className="border-border bg-card rounded-2xl border p-4 dark:inset-ring dark:inset-ring-white/5 sm:p-5">
        <div className="text-foreground/80 mb-1 flex items-center justify-between gap-2 text-xs font-medium">
          <span className="flex min-w-0 items-center gap-1.5"><Flag code={homeCode} size={16} /><span className="truncate">{homeName}</span></span>
          <span className="flex min-w-0 flex-row-reverse items-center gap-1.5"><Flag code={awayCode} size={16} /><span className="truncate">{awayName}</span></span>
        </div>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <GoalIcon label="" className="text-muted-foreground/40" size={26} />
            <p className="text-muted-2 text-sm text-pretty">{final && scored ? t("match.detailUnavailable") : t("match.noEventsYet")}</p>
            {hasSubs && !showSubs && <p className="text-muted-2 text-xs">{t("match.onlySubs")}</p>}
          </div>
        ) : (
          <ol className="relative mt-2">
            <div className="bg-border/70 absolute inset-y-0 left-1/2 w-px -translate-x-1/2" aria-hidden />
            {shown.map(({ e, score, onHome }, i) => (
            <li key={i} className="grid grid-cols-[1fr_3rem_1fr] items-center gap-2 py-2 sm:grid-cols-[1fr_3.5rem_1fr] sm:gap-3">
              <div className="flex justify-end">{onHome && <Event e={e} side="home" t={t} locale={locale} playerImages={playerImages} />}</div>
              <div className="bg-card relative z-10 flex flex-col items-center gap-1 py-0.5">
                <span className="text-muted-2 font-mono text-[10px] tabular-nums whitespace-nowrap">{e.minute}</span>
                {score ? (
                  <span className="border-border-strong bg-surface-raised text-foreground rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums">{score}</span>
                ) : (
                  <span className="bg-border size-1.5 rounded-full" aria-hidden />
                )}
              </div>
              <div className="flex justify-start">{!onHome && <Event e={e} side="away" t={t} locale={locale} playerImages={playerImages} />}</div>
            </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Event({ e, side, t, locale, playerImages }: { e: MatchEvent; side: "home" | "away"; t: T; locale: Locale; playerImages?: Record<string, string> }) {
  const home = side === "home";
  const avatar = e.teamCode ? playerImages?.[`${e.teamCode}|${e.player}`] : undefined;
  const tag = e.goalType === "penalty" ? t("match.penaltyTag") : e.goalType === "own" ? t("match.ownGoalTag") : null;
  const icon =
    e.kind === "goal" ? (
      <GoalIcon label={t("match.goalLabel")} />
    ) : e.kind === "card" ? (
      <span
        className={`h-3.5 w-2.5 rounded-[2px] ${e.card === "red" ? "bg-[#dc2626]" : "bg-[#eab308]"}`}
        role="img"
        aria-label={e.card === "red" ? t("match.redCardLabel") : t("match.yellowCardLabel")}
      />
    ) : (
      <SubIcon label={t("match.subLabel")} />
    );
  // The headshot must stay glued to the player's NAME, not to the whole text block. The block is only as wide
  // as its widest line — often the assist ("assist: Ousmane Dembélé"), which is wider than the name — so keeping
  // the avatar outside it left a gap between the avatar and the (spine-aligned) name. Instead, the avatar +
  // name + type-icon form one tight row, with the assist / sub-off lines stacked beneath it.
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${home ? "items-end" : "items-start"}`}>
      <div className={`flex min-w-0 max-w-full items-center gap-2 ${home ? "flex-row" : "flex-row-reverse"}`}>
        {avatar ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={avatar} alt="" loading="lazy" decoding="async" className="border-border bg-muted size-7 shrink-0 rounded-full border object-cover object-top" />
        ) : null}
        <div className={`min-w-0 truncate text-sm ${home ? "text-right" : "text-left"}`}>
          <PlayerName name={e.player} code={e.teamCode} locale={locale} className={e.kind === "goal" ? "font-semibold" : "text-foreground/90"} />
          {tag && <span className="text-muted-2 ms-1 font-mono text-[10px] tracking-wide uppercase">({tag})</span>}
        </div>
        <span className="flex w-4 shrink-0 justify-center">{icon}</span>
      </div>
      {e.assist && (
        <div className={`text-muted-2 min-w-0 max-w-full truncate text-[11px] ${home ? "text-right" : "text-left"}`}>
          <LinkedLine template={t("match.assist", { name: NAME_SLOT })} name={e.assist} code={e.teamCode} locale={locale} />
        </div>
      )}
      {e.playerOff && (
        <div className={`text-muted-2 min-w-0 max-w-full truncate text-[11px] ${home ? "text-right" : "text-left"}`}>
          <LinkedLine template={t("match.subOff", { name: NAME_SLOT })} name={e.playerOff} code={e.teamCode} locale={locale} />
        </div>
      )}
    </div>
  );
}

// A pitch-green soccer ball — the universal "goal" mark. Muted/larger via props for the empty state.
function GoalIcon({ label, className = "text-primary", size = 15 }: { label: string; className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} role="img" aria-label={label || undefined} aria-hidden={!label}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8.2l3.8 2.76-1.45 4.47h-4.7L8.2 10.96z" fill="currentColor" />
      <path
        d="M12 8.2V3.5M15.8 10.96l4.2-1.5M14.35 15.43l3 3.1M9.65 15.43l-3 3.1M8.2 10.96l-4.2-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Substitution: a green arrow on (up) and a muted arrow off (down).
function SubIcon({ label }: { label: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label || undefined} aria-hidden={!label}>
      <path d="M8 20V6m0 0L5 9m3-3 3 3" className="stroke-win" />
      <path d="M16 4v14m0 0-3-3m3 3 3-3" className="stroke-muted-foreground" />
    </svg>
  );
}
