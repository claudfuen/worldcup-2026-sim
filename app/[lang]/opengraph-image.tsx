import { ImageResponse } from "next/og";
import { getPredictions } from "@/lib/getPredictions";

// Dynamic social-share image (also used for Twitter): shows the live title-odds leaderboard so the
// card itself previews the forecast. 1200×630 is the standard OG size.
export const alt = "World Cup 2026 Predictions — live title odds, bracket and champion probabilities";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GREEN = "#5fe39a";
const MUTED = "#9fb3a8";

export default async function OpengraphImage() {
  let teams: { name: string; title: number }[] = [];
  let matchesPlayed = 0;
  let totalGroup = 72;
  let iterations = 20000;
  try {
    const data = await getPredictions();
    teams = data.teams.slice(0, 5).map((t) => ({ name: t.name, title: t.title }));
    matchesPlayed = data.matchesPlayed;
    totalGroup = data.totalGroupMatches;
    iterations = data.iterations;
  } catch {
    /* fall back to the no-data layout */
  }
  const maxTitle = teams[0]?.title || 1;
  const pct = (v: number) => `${Math.max(1, Math.round(Math.min(v, 0.99) * 100))}%`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0a0f0b 0%, #0d1410 55%, #102417 100%)",
          color: "#f7faf8",
          fontFamily: "sans-serif",
        }}
      >
        {/* eyebrow */}
        <div style={{ display: "flex", fontSize: 25, letterSpacing: 4, color: GREEN, fontWeight: 600 }}>
          MONTE CARLO FORECAST · {matchesPlayed}/{totalGroup} GROUP MATCHES PLAYED
        </div>

        {/* main: title + live leaderboard */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1, marginTop: 36, marginBottom: 36 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 590 }}>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, whiteSpace: "nowrap" }}>World Cup 2026</div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, color: GREEN }}>Predictions</div>
            <div style={{ display: "flex", marginTop: 24, fontSize: 29, color: MUTED, lineHeight: 1.3 }}>
              Live odds to advance, reach each round &amp; lift the trophy.
            </div>
          </div>

          {/* leaderboard card */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 440,
              padding: "26px 28px",
              borderRadius: 24,
              border: "1px solid #2a3a30",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ display: "flex", fontSize: 19, letterSpacing: 3, color: MUTED, fontWeight: 600, marginBottom: 18 }}>
              TITLE ODDS
            </div>
            {teams.map((t, i) => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", marginBottom: i === teams.length - 1 ? 0 : 16 }}>
                <div style={{ display: "flex", width: 22, fontSize: 22, color: MUTED, fontWeight: 600 }}>{i + 1}</div>
                <div style={{ display: "flex", width: 150, fontSize: 26, fontWeight: 600 }}>{t.name}</div>
                <div style={{ display: "flex", flex: 1, height: 10, borderRadius: 6, background: "rgba(255,255,255,0.08)", marginRight: 14 }}>
                  <div style={{ display: "flex", width: `${Math.round((t.title / maxTitle) * 100)}%`, height: 10, borderRadius: 6, background: GREEN }} />
                </div>
                <div style={{ display: "flex", width: 56, justifyContent: "flex-end", fontSize: 26, fontWeight: 700 }}>{pct(t.title)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #2a3a30", paddingTop: 26, fontSize: 28 }}>
          <div style={{ display: "flex", color: "#8aa394" }}>worldcup2026predictions.app</div>
          <div style={{ display: "flex", alignItems: "center", color: GREEN, fontWeight: 600 }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: GREEN, marginRight: 10 }} />
            {iterations.toLocaleString()} simulations
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
