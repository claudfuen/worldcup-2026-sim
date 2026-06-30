import { ImageResponse } from "next/og";
import { getPredictions } from "@/lib/getPredictions";
import { VENUE_BY_SLUG } from "@/lib/data/venues";
import { VENUE_PHOTOS } from "@/lib/data/venuePhotos";
import { flagDataUri, imgDataUri, OG_SIZE, OG_CONTENT_TYPE, OG_BG, OG_FG, OG_GREEN, OG_GOLD, OG_MUTED } from "@/lib/og";

// Dynamic per-venue social card: the real stadium photo (Wikimedia Commons, credited) as the backdrop with the
// FIFA host-city name + original name, host city/country, capacity and matches over it — gold when it hosts the
// Final. Falls back to a styled text card when no photo is available.
export const alt = "World Cup 2026 host venue";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUND_LABEL: Record<string, string> = {
  GROUP: "Group", R32: "R32", R16: "R16", QF: "QF", SF: "SF", "3P": "3rd", FINAL: "Final",
};
const ROUND_ORDER = ["GROUP", "R32", "R16", "QF", "SF", "3P", "FINAL"];

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = VENUE_BY_SLUG[slug];

  if (!v) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 72px", background: OG_BG, color: OG_FG, fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", fontSize: 25, letterSpacing: 4, color: OG_GREEN, fontWeight: 600 }}>WORLD CUP 2026</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -2, marginTop: 18 }}>Host venue</div>
          <div style={{ display: "flex", fontSize: 28, color: OG_MUTED, marginTop: 16 }}>worldcup2026predictions.app</div>
        </div>
      ),
      { ...size },
    );
  }

  let total = 0;
  let roundsHosted: string[] = [];
  let hostsFinal = false;
  try {
    const data = await getPredictions();
    const here = data.matches.filter((m) => m.venue === v.key);
    total = here.length;
    roundsHosted = ROUND_ORDER.filter((r) => here.some((m) => m.round === r));
    hostsFinal = here.some((m) => m.round === "FINAL");
  } catch {
    /* fall through — render the static venue facts only */
  }

  const photoMeta = VENUE_PHOTOS[slug];
  const [flag, photo] = await Promise.all([flagDataUri(v.hostCode), imgDataUri(photoMeta?.url)]);

  const stats: { label: string; value: string }[] = [
    { label: "Capacity", value: v.capacity.toLocaleString("en-US") },
    { label: "Matches", value: total ? String(total) : "—" },
  ];

  // With a real photo: full-bleed backdrop + legibility gradient + overlaid facts + required credit line.
  if (photo) {
    return new ImageResponse(
      (
        <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", fontFamily: "sans-serif" }}>
          <img src={photo} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", background: "linear-gradient(180deg, rgba(6,10,8,0.74) 0%, rgba(6,10,8,0.10) 34%, rgba(6,10,8,0.55) 66%, rgba(6,10,8,0.93) 100%)" }} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "56px 64px", color: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: OG_GREEN, fontWeight: 600 }}>WORLD CUP 2026 · HOST VENUE</div>
              {hostsFinal && (
                <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: OG_GOLD, fontWeight: 700, border: `1px solid ${OG_GOLD}`, borderRadius: 999, padding: "8px 20px", background: "rgba(6,10,8,0.35)" }}>HOSTS THE FINAL</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 80, fontWeight: 700, letterSpacing: -2, lineHeight: 1.02 }}>{v.fifaName}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
                {flag && <img src={flag} width={40} height={30} style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,0.25)", objectFit: "cover" }} />}
                <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>{v.key} · {v.city}, {v.country}</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 28 }}>
                <div style={{ display: "flex", gap: 52 }}>
                  {stats.map((s) => (
                    <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", fontSize: 18, letterSpacing: 2, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>{s.label.toUpperCase()}</div>
                      <div style={{ display: "flex", fontSize: 50, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
                    </div>
                  ))}
                  {roundsHosted.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", fontSize: 18, letterSpacing: 2, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>HOSTS</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {roundsHosted.map((r) => (
                          <div key={r} style={{ display: "flex", fontSize: 22, fontWeight: 600, color: r === "FINAL" ? OG_GOLD : "#fff", background: "rgba(255,255,255,0.14)", borderRadius: 8, padding: "8px 14px" }}>{ROUND_LABEL[r]}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", color: "rgba(255,255,255,0.8)", fontSize: 24 }}>worldcup2026predictions.app</div>
              </div>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 8, right: 14, display: "flex", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            Photo: {photoMeta.artist}{photoMeta.license ? ` · ${photoMeta.license}` : ""}
          </div>
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: OG_BG, color: OG_FG, fontFamily: "sans-serif" }}>
        {/* eyebrow + final badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 25, letterSpacing: 4, color: OG_GREEN, fontWeight: 600 }}>WORLD CUP 2026 · HOST VENUE</div>
          {hostsFinal && (
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 2, color: OG_GOLD, fontWeight: 700, border: `1px solid ${OG_GOLD}`, borderRadius: 999, padding: "8px 20px" }}>HOSTS THE FINAL</div>
          )}
        </div>

        {/* stadium name + location */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 700, letterSpacing: -2, lineHeight: 1.02 }}>{v.fifaName}</div>
          <div style={{ display: "flex", fontSize: 30, color: OG_MUTED, marginTop: 16 }}>{v.key}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
            {flag && <img src={flag} style={{ width: 44, height: 33, borderRadius: 6, border: "1px solid rgba(255,255,255,0.18)", objectFit: "cover" }} />}
            <div style={{ display: "flex", fontSize: 30, fontWeight: 600 }}>{v.city}, {v.country}</div>
          </div>
        </div>

        {/* stat strip + rounds */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 56 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 19, letterSpacing: 2, color: OG_MUTED, fontWeight: 600 }}>{s.label.toUpperCase()}</div>
                <div style={{ display: "flex", fontSize: 52, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
            {roundsHosted.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 19, letterSpacing: 2, color: OG_MUTED, fontWeight: 600 }}>HOSTS</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {roundsHosted.map((r) => (
                    <div key={r} style={{ display: "flex", fontSize: 22, fontWeight: 600, color: r === "FINAL" ? OG_GOLD : OG_FG, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 14px" }}>{ROUND_LABEL[r]}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", color: "#8aa394", fontSize: 26 }}>worldcup2026predictions.app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
