import { geoAlbers, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { VENUES, type Venue } from "@/lib/data/venues";
import { WORLD_LAND } from "@/lib/data/worldLand";
import { NORTH_AMERICA } from "@/lib/data/northAmerica";
import { localeHref, type Locale } from "@/lib/i18n/config";

// The 16 host venues on a flat map of North America (d3-geo Albers — the standard conic projection for the
// continent). Surrounding coastlines sit muted for context, the three host nations are lifted in pitch-green,
// and each venue is a pin (sized by how many matches it holds) with an always-on city label, linking to its
// page. One server-rendered SVG via a real projection — no client JS, no overlay, hydrates cleanly.

// Map frame: the venue bounding box with a margin, so the constellation fills the map with room for labels.
const FRAME: GeoPermissibleObjects = {
  type: "Polygon",
  coordinates: [[[-126, 16], [-66, 16], [-66, 51], [-126, 51], [-126, 16]]],
};
const FIT = 1000;
const projection = geoAlbers().fitSize([FIT, FIT], FRAME);
const path = geoPath(projection);

const asMulti = (rings: [number, number][][]): GeoPermissibleObjects => ({
  type: "MultiPolygon",
  coordinates: rings.map((r) => [r]),
});

const worldD = path(asMulti(WORLD_LAND)) ?? "";
const naD = path(asMulti(NORTH_AMERICA)) ?? "";
// Tight viewBox = the projected frame's bounds, so the frame exactly fills the SVG (landmass beyond is clipped).
const b = path.bounds(FRAME);
const VB = { x: b[0][0], y: b[0][1], w: b[1][0] - b[0][0], h: b[1][1] - b[0][1] };

const FILL: Record<Venue["country"], string> = {
  USA: "var(--win)",
  Mexico: "var(--contention)",
  Canada: "var(--data-cool)",
};

export function VenueMap({ counts, locale }: { counts: Record<string, number>; locale: Locale }) {
  const max = Math.max(1, ...VENUES.map((v) => counts[v.slug] ?? 0));
  const pins = VENUES.map((v) => {
    const xy = projection([v.lng, v.lat]);
    return xy ? { v, x: xy[0], y: xy[1] } : null;
  })
    .filter((p): p is { v: Venue; x: number; y: number } => p !== null)
    .sort((a, b) => a.y - b.y); // paint top-to-bottom so southern labels overlap northern dots, not vice-versa

  return (
    <figure className="m-0">
      <div className="border-border bg-card relative w-full overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="block h-auto w-full" role="img" aria-label="Map of the 16 host venues across the United States, Mexico and Canada">
          {/* surrounding coastlines, muted for context */}
          <path d={worldD} fill="var(--muted-foreground)" fillOpacity={0.1} stroke="var(--muted-foreground)" strokeOpacity={0.15} strokeWidth={0.6} />
          {/* host nations, lifted in pitch-green */}
          <path d={naD} fill="var(--primary)" fillOpacity={0.14} stroke="var(--primary)" strokeOpacity={0.45} strokeWidth={1} strokeLinejoin="round" />

          {pins.map(({ v, x, y }) => {
            const n = counts[v.slug] ?? 0;
            const r = 5 + (n / max) * 5;
            const labelLeft = x > VB.x + VB.w * 0.72; // flip label to the left near the right edge
            return (
              <a key={v.slug} href={localeHref(locale, `/venues/${v.slug}`)} className="group" aria-label={`${v.fifaName}, ${v.city}`}>
                <title>{`${v.fifaName} · ${v.city}`}</title>
                <circle cx={x} cy={y} r={r + 3} fill="var(--card)" fillOpacity={0.7} />
                <circle cx={x} cy={y} r={r} fill={FILL[v.country]} stroke="var(--card)" strokeWidth={1.5} className="group-hover:brightness-110" />
                <text
                  x={labelLeft ? x - r - 7 : x + r + 7}
                  y={y}
                  textAnchor={labelLeft ? "end" : "start"}
                  dominantBaseline="central"
                  className="fill-foreground stroke-card group-hover:fill-primary"
                  style={{ fontSize: 18, fontWeight: 600, paintOrder: "stroke", strokeWidth: 4 }}
                >
                  {v.city}
                </text>
              </a>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs">
        {([["USA", "United States"], ["Mexico", "Mexico"], ["Canada", "Canada"]] as const).map(([key, label]) => (
          <span key={key} className="text-muted-foreground inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: FILL[key] }} />
            {label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
