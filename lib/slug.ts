import { TEAMS, TEAM_BY_CODE } from "./data/teams";

// URL slug for a team, e.g. "South Korea" -> "south-korea", "Türkiye" -> "turkiye".
export function teamSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (ü -> u)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Stable, locale-INDEPENDENT slug from a team CODE. Use this to build every /team/<slug> href, so URLs
// stay English even after display names are localized (teamSlug(localizedName) would produce e.g.
// "españa" and break the route, whose params are the English slugs).
export function slugForCode(code: string): string {
  const t = TEAM_BY_CODE[code];
  return teamSlug(t ? t.name : code);
}

export function teamFromSlug(slug: string): (typeof TEAMS)[number] | undefined {
  return TEAMS.find((t) => teamSlug(t.name) === slug);
}
