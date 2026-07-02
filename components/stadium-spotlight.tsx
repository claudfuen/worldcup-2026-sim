import Link from "next/link";
import { Flag } from "@/components/flag";
import { LocalTime, RelativeDay } from "@/components/local-time";
import { VENUE_BY_KEY } from "@/lib/data/venues";
import { VENUE_PHOTOS } from "@/lib/data/venuePhotos";
import type { MatchInfo } from "@/lib/predictions";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// Homepage stadium spotlight: surfaces the venue of the match happening NOW, else the next one up, else the
// most recent — over a real photo of the stadium. Gives the page a sense of place. Skipped entirely if the
// chosen match's venue has no photo. Two separate links (venue / match) so neither anchor nests in the other.
function pickMatch(matches: MatchInfo[]): MatchInfo | null {
  const withVenue = matches.filter((m) => m.venue && VENUE_PHOTOS[VENUE_BY_KEY[m.venue]?.slug ?? ""]);
  const live = withVenue.filter((m) => m.status === "live").sort((a, b) => a.utc.localeCompare(b.utc));
  if (live.length) return live[0];
  const now = Date.now();
  const upcoming = withVenue
    .filter((m) => m.status === "scheduled" && Date.parse(m.utc) >= now - 30 * 60_000)
    .sort((a, b) => a.utc.localeCompare(b.utc));
  if (upcoming.length) return upcoming[0];
  const done = withVenue.filter((m) => m.status === "final").sort((a, b) => b.utc.localeCompare(a.utc));
  return done[0] ?? null;
}

function sideName(m: MatchInfo, which: "home" | "away") {
  const code = which === "home" ? m.home : m.away;
  const name = which === "home" ? m.homeName : m.awayName;
  const proj = (which === "home" ? m.projHome : m.projAway)?.[0];
  return { code: code ?? proj?.code ?? null, name: name ?? proj?.name ?? null };
}

export async function StadiumSpotlight({ matches, className = "" }: { matches: MatchInfo[]; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const m = pickMatch(matches);
  if (!m) return null;
  const v = VENUE_BY_KEY[m.venue];
  const photo = VENUE_PHOTOS[v.slug];
  const label = m.status === "live" ? t("spotlight.live") : m.status === "final" ? t("spotlight.latest") : t("spotlight.next");
  const h = sideName(m, "home");
  const a = sideName(m, "away");

  return (
    <section className={`group relative overflow-hidden rounded-2xl border border-border dark:inset-ring dark:inset-ring-white/5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={v.fifaName} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(6,10,8,0.92)] via-[rgba(6,10,8,0.45)] to-[rgba(6,10,8,0.55)]" aria-hidden />
      <div className="relative flex min-h-[260px] flex-col justify-between gap-4 p-5 text-white sm:min-h-[300px] sm:p-6">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em] uppercase ${m.status === "live" ? "bg-live/90 text-white" : "bg-white/15 text-white"}`}>
            {m.status === "live" && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
            {label}
          </span>
          <span className="font-mono text-[11px] tracking-wide text-white/75" suppressHydrationWarning>
            {m.status === "live" ? (m.liveDetail ?? t("common.live")) : <><RelativeDay utc={m.utc} /> · <LocalTime utc={m.utc} mode="timeshort" /></>}
          </span>
        </div>

        <div>
          <Link href={localeHref(locale, `/venues/${v.slug}`)} className="block">
            <div className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{v.fifaName}</div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-white/80">
              <Flag code={v.hostCode} size={16} /> {v.city}, {t(`teams.${v.hostCode}`)}
            </div>
          </Link>

          <Link
            href={localeHref(locale, `/match/${m.match}`)}
            className="mt-3 inline-flex items-center gap-2.5 rounded-xl bg-black/30 px-3 py-2 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-black/45"
          >
            <span className="inline-flex items-center gap-1.5"><Flag code={h.code} size={18} /> {h.name ?? t("common.tbd")}</span>
            <span className="text-white/55">{t("common.vs")}</span>
            <span className="inline-flex items-center gap-1.5"><Flag code={a.code} size={18} /> {a.name ?? t("common.tbd")}</span>
          </Link>
        </div>
      </div>
      <div className="absolute right-2 bottom-1.5 font-mono text-[9px] text-white/45">{photo.artist}{photo.license ? ` · ${photo.license}` : ""}</div>
    </section>
  );
}
