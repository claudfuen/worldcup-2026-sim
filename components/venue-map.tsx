import Link from "next/link";
import { VENUES, type Venue } from "@/lib/data/venues";
import { localeHref, type Locale } from "@/lib/i18n/config";

// A schematic geographic overview of the 16 host venues — dots placed by latitude/longitude across the
// three host nations, sized by how many matches each holds, each a link to that venue. Pure HTML (absolutely
// positioned over a faint grid) so it hydrates cleanly and navigates client-side.
//
// Equirectangular projection with a UNIFORM scale (longitude corrected by cos(mean latitude)) so the
// constellation keeps its true geographic shape instead of being stretched to fill the box — then centered.

const AR = 16 / 10; // container aspect (width / height), must match the style below
const PADF = 0.08; // fractional inset so edge dots + labels stay in frame

const lats = VENUES.map((v) => v.lat);
const lngs = VENUES.map((v) => v.lng);
const minLat = Math.min(...lats), maxLat = Math.max(...lats);
const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
const KX = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180); // longitude foreshortening at mean latitude
const GX = (maxLng - minLng) * KX; // geographic extent (scaled degrees)
const GY = maxLat - minLat;
// One scale for both axes (units = container height); whichever axis is tighter sets it. Work in height
// units, where the container is AR units wide, so left% divides by AR.
const S = Math.min((AR * (1 - 2 * PADF)) / GX, (1 - 2 * PADF) / GY);
const OFF_X = (AR - GX * S) / 2;
const OFF_Y = (1 - GY * S) / 2;
const pos = (v: Venue) => {
  const ux = OFF_X + (v.lng - minLng) * KX * S;
  const uy = OFF_Y + (maxLat - v.lat) * S;
  return { left: (ux / AR) * 100, top: uy * 100 };
};

const FILL: Record<Venue["country"], string> = {
  USA: "var(--win)", Mexico: "var(--contention)", Canada: "var(--data-cool)",
};

export function VenueMap({ counts, locale }: { counts: Record<string, number>; locale: Locale }) {
  const max = Math.max(1, ...VENUES.map((v) => counts[v.slug] ?? 0));
  return (
    <div
      className="border-border bg-card relative w-full overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5"
      style={{
        aspectRatio: "16 / 10",
        backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
        backgroundSize: "11.11% 12.5%",
      }}
    >
      {VENUES.map((v) => {
        const { left, top } = pos(v);
        const n = counts[v.slug] ?? 0;
        const size = 14 + Math.round((n / max) * 16);
        const labelRight = left < 66;
        return (
          <Link
            key={v.slug}
            href={localeHref(locale, `/venues/${v.slug}`)}
            title={`${v.fifaName} · ${v.city}`}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5"
            style={{ left: `${left}%`, top: `${top}%`, flexDirection: labelRight ? "row" : "row-reverse" }}
          >
            <span
              className="block shrink-0 rounded-full ring-2 ring-[var(--card)] transition-transform group-hover:scale-110"
              style={{ width: size, height: size, backgroundColor: FILL[v.country], opacity: 0.9 }}
            />
            <span className="text-muted-foreground group-hover:text-foreground whitespace-nowrap font-mono text-[11px] font-semibold transition-colors sm:text-[13px]">
              {v.city}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
