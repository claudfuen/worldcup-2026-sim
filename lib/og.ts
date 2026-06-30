// Shared building blocks for the dynamic OpenGraph cards (next/og). All cards are 1200×630, English-only
// (proper nouns + numbers), on the stadium-night gradient — keep them visually consistent.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ISO2 } from "@/lib/flags";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Palette (mirrors the app tokens, hard-coded because Satori has no CSS variables).
export const OG_GREEN = "#5fe39a"; // pitch-green accent / "win"
export const OG_COOL = "#6db7e6"; // data-cool blue
export const OG_GOLD = "#e8c468"; // contention gold
export const OG_MUTED = "#9fb3a8";
export const OG_FG = "#f7faf8";
export const OG_BG = "linear-gradient(135deg, #0a0f0b 0%, #0d1410 55%, #102417 100%)";

// A team's flag as an inlined data URI (Satori can't use the flag-icons CSS classes). Reads the bundled SVG;
// falls back to the flag-icons CDN if the asset isn't in the serverless bundle. Returns null for unknown codes.
export async function flagDataUri(code?: string | null): Promise<string | null> {
  const iso = code ? ISO2[code] : null;
  if (!iso) return null;
  let svg: string | null = null;
  try {
    svg = await readFile(join(process.cwd(), "node_modules/flag-icons/flags/4x3", `${iso}.svg`), "utf8");
  } catch {
    try {
      const r = await fetch(`https://cdn.jsdelivr.net/npm/flag-icons@7/flags/4x3/${iso}.svg`);
      if (r.ok) svg = await r.text();
    } catch {
      /* no flag — caller renders the name only */
    }
  }
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
}

// A single-match/forecast probability is never a certainty — cap at 99% (mirrors lib/format forecastPct).
export function ogPct(v: number): string {
  return `${Math.max(1, Math.round(Math.min(v, 0.99) * 100))}%`;
}

// Fetch a remote image into a data URI so Satori embeds it reliably (no external fetch at draw time).
// Returns null on any failure so the card falls back to its no-image layout.
export async function imgDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/png";
    return `data:${ct};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}
