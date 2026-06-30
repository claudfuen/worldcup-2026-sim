import type { MetadataRoute } from "next";
import { SCHEDULE } from "@/lib/data/schedule";
import { TEAMS, GROUPS } from "@/lib/data/teams";
import { VENUES } from "@/lib/data/venues";
import { teamSlug } from "@/lib/slug";
import { playerUniverse } from "@/lib/players";
import { getPredictions } from "@/lib/getPredictions";
import type { Awards } from "@/lib/awards";
import { ACTIVE_LOCALES, DEFAULT_LOCALE, localeHref, type Locale } from "@/lib/i18n/config";

const SITE_URL = "https://worldcup2026predictions.app";

const abs = (loc: Locale, path: string) => {
  const p = localeHref(loc, path);
  return p === "/" ? SITE_URL : `${SITE_URL}${p}`;
};

// hreflang alternates for a locale-less path: every ACTIVE locale + x-default. Loops the config, so
// launching a locale (ready:true) expands the sitemap automatically — no per-route edits.
const langsFor = (path: string): Record<string, string> => {
  const langs: Record<string, string> = {};
  for (const l of ACTIVE_LOCALES) langs[l.hreflang] = abs(l.id, path);
  langs["x-default"] = abs(DEFAULT_LOCALE, path);
  return langs;
};

type Freq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Use the live data timestamp as lastModified so Googlebot re-crawls when the forecast actually moves.
  let lastModified = new Date();
  let awards: Awards | null = null;
  try {
    const d = await getPredictions();
    if (d.updatedAt) lastModified = new Date(d.updatedAt);
    awards = d.awards;
  } catch {
    /* fall back to now */
  }
  const now = Date.now();
  const HOT_WINDOW = 48 * 3600 * 1000; // next 48h
  const RECENT = 24 * 3600 * 1000; // last 24h

  // One crawl hint per locale-LESS canonical path; we then fan each out across every active locale.
  const hints: { path: string; changeFrequency: Freq; priority: number }[] = [
    { path: "/", changeFrequency: "hourly", priority: 1 },
    { path: "/bracket", changeFrequency: "hourly", priority: 0.9 },
    { path: "/groups", changeFrequency: "hourly", priority: 0.9 },
    { path: "/schedule", changeFrequency: "hourly", priority: 0.8 },
    { path: "/calendar", changeFrequency: "hourly", priority: 0.8 },
    { path: "/awards", changeFrequency: "daily", priority: 0.7 },
    { path: "/title-race", changeFrequency: "hourly", priority: 0.7 },
    { path: "/venues", changeFrequency: "weekly", priority: 0.6 },
    { path: "/scorecard", changeFrequency: "daily", priority: 0.5 },
    { path: "/methodology", changeFrequency: "weekly", priority: 0.5 },
    ...TEAMS.map((t) => ({ path: `/team/${teamSlug(t.name)}`, changeFrequency: "daily" as Freq, priority: 0.7 })),
    ...GROUPS.map((g) => ({ path: `/group/${g.toLowerCase()}`, changeFrequency: "daily" as Freq, priority: 0.7 })),
    ...VENUES.map((v) => ({ path: `/venues/${v.slug}`, changeFrequency: "weekly" as Freq, priority: 0.5 })),
    // Players who have a tally (a goal or assist) — grows through the tournament, so new pages get indexed.
    ...(awards ? playerUniverse(awards).map((p) => ({ path: `/player/${p.slug}`, changeFrequency: "daily" as Freq, priority: 0.5 })) : []),
    ...SCHEDULE.map((m) => {
      const dt = new Date(m.utc).getTime() - now;
      const hot = dt < HOT_WINDOW && dt > -RECENT;
      return {
        path: `/match/${m.match}`,
        changeFrequency: (hot ? "hourly" : "daily") as Freq,
        priority: hot ? 0.9 : 0.4,
      };
    }),
  ];

  const entries: MetadataRoute.Sitemap = [];
  for (const h of hints) {
    const languages = langsFor(h.path);
    for (const l of ACTIVE_LOCALES) {
      entries.push({
        url: abs(l.id, h.path),
        lastModified,
        changeFrequency: h.changeFrequency,
        priority: h.priority,
        alternates: { languages },
      });
    }
  }
  return entries;
}
