import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPredictions } from "@/lib/getPredictions";
import { ISO2 } from "@/lib/flags";

// Dynamic per-match social card: the matchup (with big country flags) + the model's win probability
// (or the final score).
export const alt = "World Cup 2026 match prediction";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A team's flag as an inlined data URI (Satori can't use the flag-icons CSS classes). Reads the bundled SVG;
// falls back to the flag-icons CDN if the asset isn't in the serverless bundle. Returns null for TBD slots.
async function flagDataUri(code?: string | null): Promise<string | null> {
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
      /* no flag — render the name only */
    }
  }
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
}

const ROUND: Record<string, string> = {
  GROUP: "Group stage", R32: "Round of 32", R16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", "3P": "Third-place play-off", FINAL: "Final",
};
const GREEN = "#5fe39a";
const COOL = "#6db7e6";
const MUTED = "#9fb3a8";

function slotLabel(s?: string): string {
  if (!s) return "TBD";
  if (/^1[A-L]$/.test(s)) return `Winner ${s[1]}`;
  if (/^2[A-L]$/.test(s)) return `Runner-up ${s[1]}`;
  if (s.startsWith("3:")) return "Best third";
  if (s.startsWith("W")) return `Winner M${s.slice(1)}`;
  return s;
}

export default async function Image({ params }: { params: Promise<{ match: string }> }) {
  const { match } = await params;
  let m: Awaited<ReturnType<typeof getPredictions>>["matches"][number] | undefined;
  try {
    const data = await getPredictions();
    m = data.matches.find((x) => x.match === Number(match));
  } catch {
    /* fall through to TBD */
  }

  const homeName = m?.homeName ?? slotLabel(m?.slotHome);
  const awayName = m?.awayName ?? slotLabel(m?.slotAway);
  const [homeFlag, awayFlag] = await Promise.all([flagDataUri(m?.home), flagDataUri(m?.away)]);
  const FLAG_W = 168;
  const flagStyle = { width: FLAG_W, height: Math.round((FLAG_W * 3) / 4), borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", objectFit: "cover" as const };
  const round = m ? ROUND[m.round] : "World Cup 2026";
  const group = m?.group ? ` · Group ${m.group}` : "";
  const final = m?.status === "final";
  const probs = m?.probs;
  const topScore = m?.topScores?.[0];
  // A one-line hook under the bar: the model's single likeliest scoreline for an upcoming match.
  const hook = !final && topScore ? `Most likely scoreline ${topScore.h}–${topScore.a}` : null;
  // A single-match win probability is a forecast, never a certainty - cap at 99% (mirrors forecastPct).
  const pc = (v: number) => `${Math.max(1, Math.round(Math.min(v, 0.99) * 100))}%`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "64px 72px", background: "linear-gradient(135deg, #0a0f0b 0%, #0d1410 55%, #102417 100%)",
          color: "#f7faf8", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 3, color: GREEN, fontWeight: 600 }}>
          {round.toUpperCase()}{group.toUpperCase()}
        </div>

        {/* matchup — big flag above each team name, flanking the score/vs */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "flex-end", gap: 22 }}>
            {homeFlag && <img src={homeFlag} style={flagStyle} />}
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -1, textAlign: "right" }}>{homeName}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 200 }}>
            {final ? (
              <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -1 }}>{m?.homeScore}–{m?.awayScore}</div>
            ) : (
              <div style={{ display: "flex", fontSize: 44, fontWeight: 600, color: MUTED }}>vs</div>
            )}
            <div style={{ display: "flex", fontSize: 22, color: MUTED, marginTop: 8 }}>{final ? "Full time" : "Match " + (m?.match ?? match)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "flex-start", gap: 22 }}>
            {awayFlag && <img src={awayFlag} style={flagStyle} />}
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -1 }}>{awayName}</div>
          </div>
        </div>

        {/* win probability bar */}
        {probs ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: MUTED, fontWeight: 600, marginBottom: 14 }}>
              {final ? "MODEL'S PRE-MATCH READ" : "WIN PROBABILITY"}
            </div>
            <div style={{ display: "flex", width: "100%", height: 18, borderRadius: 9, overflow: "hidden" }}>
              <div style={{ display: "flex", width: `${probs.home * 100}%`, background: GREEN }} />
              <div style={{ display: "flex", width: `${probs.draw * 100}%`, background: "rgba(255,255,255,0.22)" }} />
              <div style={{ display: "flex", width: `${probs.away * 100}%`, background: COOL }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 28 }}>
              <div style={{ display: "flex" }}><span style={{ color: GREEN, fontWeight: 700 }}>{pc(probs.home)}</span><span style={{ color: MUTED, marginLeft: 10 }}>{homeName}</span></div>
              <div style={{ display: "flex", color: MUTED }}>Draw {pc(probs.draw)}</div>
              <div style={{ display: "flex" }}><span style={{ color: MUTED, marginRight: 10 }}>{awayName}</span><span style={{ color: COOL, fontWeight: 700 }}>{pc(probs.away)}</span></div>
            </div>
            {hook && <div style={{ display: "flex", marginTop: 18, fontSize: 24, color: MUTED }}>{hook}</div>}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>worldcup2026predictions.app</div>
        )}
      </div>
    ),
    { ...size },
  );
}
