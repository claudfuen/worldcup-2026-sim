import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { VENUES, type Venue } from "@/lib/data/venues";
import { WORLD_LAND } from "@/lib/data/worldLand";
import { NORTH_AMERICA } from "@/lib/data/northAmerica";
import { localeHref, type Locale } from "@/lib/i18n/config";

// The 16 host venues on an orthographic GLOBE centered on North America: a dark stadium-night sphere with a
// faint graticule, the world's coastlines muted, the three host nations lifted in pitch-green, and a pin per
// venue (sized by how many matches it holds) linking to its page. Rendered as one server-side SVG via d3-geo
// (a real cartographic projection) — no client JS, no overlay, so it hydrates cleanly.

const W = 720; // square globe canvas (viewBox units)
const PAD = 10;
const CENTER: [number, number] = [-97, 37]; // lng/lat the globe faces — centers the venues (Mexico↔Canada span)

const projection = geoOrthographic()
  .rotate([-CENTER[0], -CENTER[1]])
  .fitExtent(
    [
      [PAD, PAD],
      [W - PAD, W - PAD],
    ],
    { type: "Sphere" },
  );
const path = geoPath(projection);

const asMulti = (rings: [number, number][][]): GeoPermissibleObjects => ({
  type: "MultiPolygon",
  coordinates: rings.map((r) => [r]),
});

const sphereD = path({ type: "Sphere" }) ?? "";
const gratD = path(geoGraticule10()) ?? "";
const worldD = path(asMulti(WORLD_LAND)) ?? "";
const naD = path(asMulti(NORTH_AMERICA)) ?? "";

// A venue sits on the near hemisphere when its angular distance to the globe's facing point is < 90°.
const onNearSide = (v: Venue) => geoDistance(CENTER, [v.lng, v.lat]) < Math.PI / 2 - 0.002;

const FILL: Record<Venue["country"], string> = {
  USA: "var(--win)",
  Mexico: "var(--contention)",
  Canada: "var(--data-cool)",
};

export function VenueMap({ counts, locale }: { counts: Record<string, number>; locale: Locale }) {
  const max = Math.max(1, ...VENUES.map((v) => counts[v.slug] ?? 0));
  const pins = VENUES.filter(onNearSide)
    .map((v) => {
      const xy = projection([v.lng, v.lat]);
      return xy ? { v, x: xy[0], y: xy[1] } : null;
    })
    .filter((p): p is { v: Venue; x: number; y: number } => p !== null)
    // paint southern/eastern pins last so they sit on top where the map is densest
    .sort((a, b) => a.y - b.y);

  return (
    <figure className="m-0">
      <div className="border-border bg-card relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        <svg viewBox={`0 0 ${W} ${W}`} className="block h-auto w-full" role="img" aria-label="Map of the 16 host venues across the United States, Mexico and Canada">
          <defs>
            <radialGradient id="globe-ocean" cx="42%" cy="36%" r="72%">
              <stop offset="0%" stopColor="var(--card)" />
              <stop offset="62%" stopColor="var(--muted)" />
              <stop offset="100%" stopColor="var(--secondary)" />
            </radialGradient>
          </defs>

          {/* ocean sphere */}
          <path d={sphereD} fill="url(#globe-ocean)" stroke="var(--border)" strokeWidth={1} />
          {/* graticule */}
          <path d={gratD} fill="none" stroke="var(--border)" strokeWidth={0.6} strokeOpacity={0.55} />
          {/* world coastlines, muted */}
          <path d={worldD} fill="var(--muted-foreground)" fillOpacity={0.16} stroke="var(--muted-foreground)" strokeOpacity={0.18} strokeWidth={0.5} />
          {/* host nations, lifted in pitch-green */}
          <path d={naD} fill="var(--primary)" fillOpacity={0.22} stroke="var(--primary)" strokeOpacity={0.55} strokeWidth={0.8} strokeLinejoin="round" />
          {/* terminator rim for a touch of depth */}
          <path d={sphereD} fill="none" stroke="var(--border)" strokeWidth={1.5} strokeOpacity={0.7} />

          {pins.map(({ v, x, y }) => {
            const n = counts[v.slug] ?? 0;
            const r = 4 + (n / max) * 4.5;
            const labelLeft = x > W * 0.62; // flip label to the left near the right edge
            return (
              <a key={v.slug} href={localeHref(locale, `/venues/${v.slug}`)} className="group" aria-label={`${v.fifaName}, ${v.city}`}>
                <title>{`${v.fifaName} · ${v.city}`}</title>
                {/* generous invisible hit area for touch */}
                <circle cx={x} cy={y} r={16} fill="transparent" />
                <circle cx={x} cy={y} r={r + 2.5} fill="var(--card)" fillOpacity={0.65} />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={FILL[v.country]}
                  stroke="var(--card)"
                  strokeWidth={1.25}
                  className="transition-[r] group-hover:brightness-110"
                />
                <text
                  x={labelLeft ? x - r - 6 : x + r + 6}
                  y={y}
                  textAnchor={labelLeft ? "end" : "start"}
                  dominantBaseline="central"
                  className="fill-foreground stroke-card opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ fontSize: 15, fontWeight: 600, paintOrder: "stroke", strokeWidth: 3.5 }}
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
