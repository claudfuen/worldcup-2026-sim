import { teamSlug } from "./slug";
import type { Awards, AwardEntry, PlayerInfo } from "./awards";

// The player universe is the full-squad list (everyone named in a matchday squad, incl. goalkeepers, plus
// any scorer) from awards.players. Each gets a stable slug (teamcode-nameslug) so routes/sitemap/search
// stay consistent, disambiguated by team in the rare same-name case.

export interface PlayerRef {
  player: string;
  teamCode: string;
  slug: string;
}

export function playerSlug(player: string, teamCode: string): string {
  return `${teamCode.toLowerCase()}-${teamSlug(player)}`;
}

/** Every player with a squad appearance or a tally. */
export function playerUniverse(awards: Awards): PlayerRef[] {
  const seen = new Map<string, PlayerRef>();
  // Prefer the full-squad list; fall back to scorers/assisters for older payloads without `players`.
  const source: { player: string; teamCode: string }[] = awards.players?.length
    ? awards.players.map((p) => ({ player: p.name, teamCode: p.teamCode }))
    : [...awards.goldenBoot, ...awards.assists].map((e) => ({ player: e.player, teamCode: e.teamCode }));
  for (const e of source) {
    const slug = playerSlug(e.player, e.teamCode);
    if (!seen.has(slug)) seen.set(slug, { player: e.player, teamCode: e.teamCode, slug });
  }
  return [...seen.values()];
}

export interface PlayerView {
  player: string;
  teamCode: string;
  info?: PlayerInfo; // squad record (position, appearances, tallies)
  goldenBoot?: AwardEntry; // entry on the Golden Boot board, with its rank
  gbRank?: number;
  assists?: AwardEntry; // entry on the assists board, with its rank
  asRank?: number;
}

/** Resolve a player slug against the squad list + awards boards, carrying each board's entry + 1-based rank. */
export function findPlayer(awards: Awards, slug: string): PlayerView | null {
  const info = (awards.players ?? []).find((p) => playerSlug(p.name, p.teamCode) === slug);
  const gbIdx = awards.goldenBoot.findIndex((e) => playerSlug(e.player, e.teamCode) === slug);
  const asIdx = awards.assists.findIndex((e) => playerSlug(e.player, e.teamCode) === slug);
  if (!info && gbIdx < 0 && asIdx < 0) return null;
  const award = gbIdx >= 0 ? awards.goldenBoot[gbIdx] : asIdx >= 0 ? awards.assists[asIdx] : undefined;
  return {
    player: info ? info.name : award!.player,
    teamCode: info ? info.teamCode : award!.teamCode,
    info,
    goldenBoot: gbIdx >= 0 ? awards.goldenBoot[gbIdx] : undefined,
    gbRank: gbIdx >= 0 ? gbIdx + 1 : undefined,
    assists: asIdx >= 0 ? awards.assists[asIdx] : undefined,
    asRank: asIdx >= 0 ? asIdx + 1 : undefined,
  };
}
