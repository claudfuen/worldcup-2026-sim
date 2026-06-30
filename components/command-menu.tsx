"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { splitLocale, localeHref, localeConfig } from "@/lib/i18n/config";
import { TEAMS, GROUPS } from "@/lib/data/teams";
import { VENUES, VENUE_BY_KEY } from "@/lib/data/venues";
import { SCHEDULE } from "@/lib/data/schedule";
import { fifaVenue } from "@/lib/venues";
import { slugForCode } from "@/lib/slug";
import { Flag } from "@/components/flag";

// A global ⌘K / Ctrl+K command palette: one search box across pages, teams, groups, stadiums and matches,
// so the whole app is reachable from any page by keyboard. Opens on the shortcut or via the nav trigger
// (which dispatches OPEN_COMMAND_EVENT). The index is built client-side from the static data modules.

export const OPEN_COMMAND_EVENT = "wc:open-command";

// Compact records from /api/search-index (codes only; names localized client-side).
interface RawMatch { n: number; round: string; utc: string; city: string; venue: string; group: string | null; status: string; h: string | null; a: string | null; ph: string[]; pa: string[]; }
interface Suggest { teams: string[]; players: string[] }
interface RawPlayer { name: string; team: string; slug: string; pos?: string; }

type ItemType = "page" | "team" | "player" | "group" | "venue" | "match";
interface Item {
  id: string;
  type: ItemType;
  label: string;
  sub?: string;
  href: string;
  code?: string; // flag (team code or host code)
  keywords: string; // normalized haystack (lowercased, accents stripped)
  words?: string[]; // keyword tokens, for typo-tolerant matching (filled in a post-build pass)
}

// Accent-insensitive lowercase, so "mbappe" finds "Mbappé" and "turkiye" finds "Türkiye".
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// True when two strings are within Levenshtein distance 1 — light typo tolerance (one insert/delete/substitute).
function lev1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la > lb) return lev1(b, a); // ensure a is the shorter/equal
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; } else { j++; } // substitution vs insertion
  }
  return edits + (la - i) + (lb - j) <= 1;
}

const PAGES: { key: string; href: string }[] = [
  { key: "nav.overview", href: "/" },
  { key: "nav.groups", href: "/groups" },
  { key: "nav.bracket", href: "/bracket" },
  { key: "nav.schedule", href: "/schedule" },
  { key: "nav.calendar", href: "/calendar" },
  { key: "nav.stadiums", href: "/venues" },
  { key: "nav.awards", href: "/awards" },
  { key: "nav.scorecard", href: "/scorecard" },
  { key: "nav.method", href: "/methodology" },
];

const ROUND_KEY: Record<string, string> = {
  GROUP: "rounds.GROUP", R32: "rounds.R32", R16: "rounds.R16", QF: "rounds.QF", SF: "rounds.SF", "3P": "rounds.THIRD", FINAL: "rounds.FINAL",
};
// English search aliases per round — so "qf", "quarter final", "last 8", "round of 16" all find the right ties
// regardless of the active locale (these are additive to the localized round label).
const ROUND_ALIAS: Record<string, string> = {
  GROUP: "group stage",
  R32: "round of 32 r32",
  R16: "round of 16 r16 last 16",
  QF: "quarter-final quarterfinal quarter final qf last 8",
  SF: "semi-final semifinal semi final sf last 4",
  "3P": "third place play-off bronze",
  FINAL: "final",
};
// Alternate ways to ask for a page.
const PAGE_ALIAS: Record<string, string> = {
  "/": "home overview model call",
  "/groups": "groups standings tables",
  "/bracket": "bracket knockout draw road to the final",
  "/schedule": "schedule fixtures matches results",
  "/calendar": "calendar fixtures by day",
  "/venues": "stadiums venues arenas grounds host cities",
  "/awards": "awards golden boot top scorer playmaker assists",
  "/scorecard": "scorecard accuracy calibration model record brier",
  "/methodology": "methodology method how it works model elo",
};
// Common alternate country names not covered by the official name or 3-letter code.
const TEAM_ALIAS: Record<string, string> = {
  "United States": "usa america united states of america",
  Netherlands: "holland dutch",
  "South Korea": "korea",
  "Ivory Coast": "cote divoire",
  Czechia: "czech republic",
  England: "three lions",
};

export function CommandMenu() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [locale] = splitLocale(pathname || "/");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [matchData, setMatchData] = useState<RawMatch[] | null>(null);
  const [playerData, setPlayerData] = useState<RawPlayer[]>([]);
  const [suggest, setSuggest] = useState<Suggest>({ teams: [], players: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  // Lazy-load the live index on first open: matches (resolved + expected matchups) and players (everyone
  // with a tally) — codes only, names localized client-side.
  const openMenu = useCallback(() => {
    setQuery(""); setActive(0); setOpen(true);
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetch("/api/search-index")
        .then((r) => r.json())
        .then((d) => { setMatchData(d.matches ?? []); setPlayerData(d.players ?? []); if (d.suggest) setSuggest(d.suggest); })
        .catch(() => { fetchedRef.current = false; });
    }
  }, []);

  // Build the search index once per locale (team/page labels are localized).
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const p of PAGES) {
      const label = t(p.key);
      out.push({ id: `page:${p.href}`, type: "page", label, href: p.href, keywords: `${label} ${PAGE_ALIAS[p.href] ?? ""}`.toLowerCase() });
    }
    for (const tm of TEAMS) {
      const name = t(`teams.${tm.code}`);
      out.push({
        id: `team:${tm.code}`, type: "team", label: name, sub: t("cmd.group", { letter: tm.group }),
        href: `/team/${slugForCode(tm.code)}`, code: tm.code,
        keywords: `${name} ${tm.code} group ${tm.group} ${TEAM_ALIAS[tm.name] ?? ""}`.toLowerCase(),
      });
    }
    for (const g of GROUPS) {
      const label = t("cmd.group", { letter: g });
      out.push({ id: `group:${g}`, type: "group", label, href: `/group/${g.toLowerCase()}`, keywords: `${label} ${g}`.toLowerCase() });
    }
    for (const v of VENUES) {
      out.push({
        id: `venue:${v.slug}`, type: "venue", label: v.fifaName, sub: `${v.city} · ${v.key}`,
        href: `/venues/${v.slug}`, code: v.hostCode,
        keywords: `${v.fifaName} ${v.key} ${v.city} ${v.country}`.toLowerCase(),
      });
    }
    for (const p of playerData) {
      const team = t(`teams.${p.team}`);
      const posLabel = p.pos ? t(`player.pos${p.pos}`) : "";
      out.push({
        id: `player:${p.slug}`, type: "player", label: p.name, sub: posLabel ? `${team} · ${posLabel}` : team,
        href: `/player/${p.slug}`, code: p.team,
        keywords: `${p.name} ${team} ${p.team} ${posLabel} ${POS_KW[p.pos ?? ""] ?? ""}`.toLowerCase(),
      });
    }
    const fmtShort = new Intl.DateTimeFormat(localeConfig(locale).intl, { month: "short", day: "numeric" });
    const nm = (c: string | null | undefined) => (c ? t(`teams.${c}`) : null);
    const vs = t("common.vs");
    if (matchData) {
      // Live index: resolved teams where known, else the expected matchup (top projected pair). Every
      // projected candidate goes into the keywords so a knockout tie is found by any likely participant.
      for (const mm of matchData) {
        const roundLabel = t(ROUND_KEY[mm.round] ?? "") || mm.round;
        const dateLabel = fmtShort.format(new Date(mm.utc));
        const iso = mm.utc.slice(0, 10);
        const hN = nm(mm.h);
        const aN = nm(mm.a);
        const projNames = [...mm.ph, ...mm.pa].map(nm).filter(Boolean) as string[];
        let label: string;
        let sub: string;
        if (hN && aN) {
          label = `${hN} ${vs} ${aN}`;
          sub = `${roundLabel} · ${dateLabel}`;
        } else if (nm(mm.ph[0]) && nm(mm.pa[0])) {
          label = `${nm(mm.ph[0])} ${vs} ${nm(mm.pa[0])}`;
          sub = `${roundLabel} · ${dateLabel} · ${t("common.projected")}`;
        } else {
          label = `${roundLabel} · ${t("cmd.matchN", { n: mm.n })}`;
          sub = dateLabel;
        }
        const venueName = fifaVenue(mm.venue);
        const venueAlias = VENUE_BY_KEY[mm.venue]?.aliases ?? "";
        const groupKw = mm.group ? `group ${mm.group}` : "";
        out.push({
          id: `match:${mm.n}`, type: "match", label, sub, href: `/match/${mm.n}`,
          keywords: `${hN ?? ""} ${aN ?? ""} ${projNames.join(" ")} ${roundLabel} ${ROUND_ALIAS[mm.round] ?? ""} ${groupKw} ${dateLabel} ${iso} ${mm.city} ${mm.venue} ${venueName} ${venueAlias} match ${mm.n} m${mm.n}`,
        });
      }
    } else {
      // Fallback before the live index loads: static schedule (group matchups + round/date for knockouts).
      for (const s of SCHEDULE) {
        const roundLabel = t(ROUND_KEY[s.round] ?? "") || s.round;
        const dateLabel = fmtShort.format(new Date(s.utc));
        const iso = s.utc.slice(0, 10);
        const label = s.home && s.away ? `${nm(s.home)} ${vs} ${nm(s.away)}` : `${roundLabel} · ${t("cmd.matchN", { n: s.match })}`;
        const venueName = fifaVenue(s.venue);
        const venueAlias = VENUE_BY_KEY[s.venue]?.aliases ?? "";
        const groupKw = s.group ? `group ${s.group}` : "";
        out.push({
          id: `match:${s.match}`, type: "match", label, sub: `${roundLabel} · ${dateLabel}`,
          href: `/match/${s.match}`,
          keywords: `${label} ${roundLabel} ${ROUND_ALIAS[s.round] ?? ""} ${groupKw} ${dateLabel} ${iso} ${s.city} ${s.venue} ${venueName} ${venueAlias} match ${s.match} m${s.match}`,
        });
      }
    }
    // Normalize haystacks (accent-insensitive) and pre-split into word tokens for typo-tolerant matching.
    for (const it of out) {
      it.keywords = norm(it.keywords);
      it.words = it.keywords.split(/[^a-z0-9]+/).filter(Boolean);
    }
    return out;
  }, [t, locale, matchData, playerData]);

  // Sectioned results: a single flat group when searching; a curated set of "most-likely-searched" groups
  // (live now → title favorites → top scorers → key pages) for the empty state, so the default view is useful.
  const sections = useMemo<{ key: string; header: string | null; items: Item[] }[]>(() => {
    const q = norm(query.trim());
    if (q) {
      // Drop matchup connectors ("Mexico v England" → mexico, england) — unless that's all the user typed.
      const raw = q.split(/\s+/).filter(Boolean);
      const stripped = raw.filter((tok) => !CONNECTORS.has(tok));
      const tokens = stripped.length ? stripped : raw;
      // A token matches by substring, or — for 4+ char tokens — within one edit of a keyword word (so a small
      // typo like "messy"/"haalnd" still finds it). Short tokens stay exact to avoid noisy matches.
      const tokenMatch = (i: Item, tok: string) =>
        i.keywords.includes(tok) || (tok.length >= 4 && (i.words ?? []).some((w) => w.length >= 3 && lev1(tok, w)));
      const scored = items
        .filter((i) => tokens.every((tok) => tokenMatch(i, tok)))
        .map((i) => {
          const label = norm(i.label);
          const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2;
          return { i, score: score * 10 + TYPE_RANK[i.type] };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 40)
        .map((s) => s.i);
      return [{ key: "results", header: null, items: scored }];
    }
    const byId = new Map(items.map((i) => [i.id, i] as const));
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((x): x is Item => !!x);
    const out: { key: string; header: string | null; items: Item[] }[] = [];
    const live = (matchData ?? []).filter((m) => m.status === "live").slice(0, 3);
    if (live.length) out.push({ key: "live", header: t("cmd.secLive"), items: pick(live.map((m) => `match:${m.n}`)) });
    const teams = pick(suggest.teams.map((c) => `team:${c}`));
    if (teams.length) out.push({ key: "teams", header: t("cmd.secFavorites"), items: teams });
    const scorers = pick(suggest.players.map((s) => `player:${s}`));
    if (scorers.length) out.push({ key: "scorers", header: t("cmd.secScorers"), items: scorers });
    out.push({ key: "pages", header: t("cmd.secPages"), items: pick(["/bracket", "/schedule", "/venues", "/awards"].map((h) => `page:${h}`)) });
    return out.filter((s) => s.items.length);
  }, [items, query, matchData, suggest, t]);

  const results = useMemo<Item[]>(() => sections.flatMap((s) => s.items), [sections]);

  // Open/close: ⌘K toggles from anywhere; the nav trigger fires OPEN_COMMAND_EVENT. Re-bound on each
  // open change so the handler reads the current state (cheap — one window listener).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (open) setOpen(false);
        else openMenu();
      }
    };
    const onOpen = () => openMenu();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
    };
  }, [open, openMenu]);

  // While open: focus the input and lock background scroll (no state writes — reset happens at open time).
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open]);

  // Keep the active row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item?: Item) => {
    if (!item) return;
    setOpen(false);
    router.push(localeHref(locale, item.href));
  };

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label={t("cmd.title")}>
      <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="border-border-strong bg-surface-raised relative w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl dark:inset-ring dark:inset-ring-white/10" onKeyDown={onKeyDown}>
        <div className="border-border/70 flex items-center gap-2.5 border-b px-4">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="text-muted-foreground shrink-0" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder={t("cmd.placeholder")}
            className="text-foreground placeholder:text-muted-2 h-14 w-full bg-transparent text-base outline-none"
            role="combobox"
            aria-expanded
            aria-controls="cmd-results"
            aria-autocomplete="list"
          />
          <kbd className="text-muted-2 border-border bg-muted/40 hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] sm:block">esc</kbd>
        </div>
        <div ref={listRef} id="cmd-results" role="listbox" className="max-h-[55vh] overflow-y-auto overscroll-contain py-2">
          {results.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">{t("cmd.empty", { q: query })}</div>
          ) : (
            (() => {
              let idx = -1; // flat index across sections, aligned with `results` for keyboard nav
              return sections.map((sec) => (
                <div key={sec.key} role="group">
                  {sec.header && <div className="text-muted-2 px-4 pt-2.5 pb-1 font-mono text-[10px] font-semibold tracking-wide uppercase">{sec.header}</div>}
                  {sec.items.map((item) => {
                    const cur = ++idx;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-idx={cur}
                        role="option"
                        aria-selected={cur === active}
                        onMouseMove={() => setActive(cur)}
                        onClick={() => go(item)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${cur === active ? "bg-muted/60" : ""}`}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center">
                          {item.code ? <Flag code={item.code} size={18} /> : <TypeIcon type={item.type} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground block truncate text-sm font-medium">{item.label}</span>
                          {item.sub && <span className="text-muted-2 block truncate text-xs">{item.sub}</span>}
                        </span>
                        <span className="text-muted-2 shrink-0 font-mono text-[10px] tracking-wide uppercase">{t(`cmd.type_${item.type}`)}</span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>
        <div className="border-border/70 text-muted-2 hidden items-center gap-4 border-t px-4 py-2 text-[10px] sm:flex">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> {t("cmd.hintNav")}</span>
          <span><Kbd>↵</Kbd> {t("cmd.hintOpen")}</span>
          <span className="ms-auto"><Kbd>esc</Kbd> {t("cmd.hintClose")}</span>
        </div>
      </div>
    </div>
  );
}

const TYPE_RANK: Record<ItemType, number> = { page: 0, team: 1, player: 2, group: 3, venue: 4, match: 5 };
// Matchup connectors ignored in queries like "Mexico v England" / "spain vs argentina".
const CONNECTORS = new Set(["v", "vs", "versus", "x"]);
// Position search aliases — so "goalkeeper", "striker", etc. find players by role.
const POS_KW: Record<string, string> = { GK: "goalkeeper keeper", DF: "defender back", MF: "midfielder", FW: "forward striker attacker winger" };

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="border-border bg-muted/40 mr-0.5 inline-block rounded border px-1 font-mono text-[10px]">{children}</kbd>;
}

function TypeIcon({ type }: { type: ItemType }) {
  const cls = "text-muted-foreground";
  if (type === "page")
    return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden><path d="M4 4h16v16H4z" /><path d="M4 9h16" /></svg>;
  if (type === "group")
    return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
  if (type === "venue")
    return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
  // match
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" /></svg>;
}
