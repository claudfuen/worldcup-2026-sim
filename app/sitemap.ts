import type { MetadataRoute } from "next";
import { SCHEDULE } from "@/lib/data/schedule";
import { getPredictions } from "@/lib/getPredictions";

const SITE_URL = "https://worldcup2026predictions.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Use the live data timestamp as lastModified so Googlebot re-crawls when the forecast actually moves.
  let lastModified = new Date();
  try {
    const d = await getPredictions();
    if (d.updatedAt) lastModified = new Date(d.updatedAt);
  } catch {
    /* fall back to now */
  }
  const now = Date.now();
  const HOT_WINDOW = 48 * 3600 * 1000; // next 48h
  const RECENT = 24 * 3600 * 1000; // last 24h

  const core: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/bracket`, lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/groups`, lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/schedule`, lastModified, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/methodology`, lastModified, changeFrequency: "weekly", priority: 0.5 },
  ];

  // Match pages: kickoff-soon or just-played get aggressive crawl signals; the rest are calmer.
  const matches: MetadataRoute.Sitemap = SCHEDULE.map((m) => {
    const dt = new Date(m.utc).getTime() - now;
    const hot = dt < HOT_WINDOW && dt > -RECENT;
    return {
      url: `${SITE_URL}/match/${m.match}`,
      lastModified,
      changeFrequency: hot ? ("hourly" as const) : ("daily" as const),
      priority: hot ? 0.9 : 0.4,
    };
  });

  return [...core, ...matches];
}
