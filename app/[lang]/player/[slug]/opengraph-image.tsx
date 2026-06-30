import { ImageResponse } from "next/og";
import { getPredictions } from "@/lib/getPredictions";
import { findPlayer } from "@/lib/players";
import { getPlayerImage } from "@/lib/playerImages";
import { TEAM_BY_CODE } from "@/lib/data/teams";
import { flagDataUri, imgDataUri, ogPct, OG_SIZE, OG_CONTENT_TYPE, OG_BG, OG_FG, OG_GREEN, OG_GOLD, OG_MUTED } from "@/lib/og";

// Dynamic per-player social card: big country flag + name + position, with the player's goals / assists /
// appearances and (if a scorer) their standing in the Golden Boot race.
export const alt = "World Cup 2026 player profile";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POSITION: Record<string, string> = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" };

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let view: ReturnType<typeof findPlayer> = null;
  try {
    const data = await getPredictions();
    view = findPlayer(data.awards, slug);
  } catch {
    /* fall through to the fallback card */
  }

  if (!view) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "64px 72px", background: OG_BG, color: OG_FG, fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", fontSize: 25, letterSpacing: 4, color: OG_GREEN, fontWeight: 600 }}>WORLD CUP 2026</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: -2, marginTop: 18 }}>Player profile</div>
          <div style={{ display: "flex", fontSize: 28, color: OG_MUTED, marginTop: 16 }}>worldcup2026predictions.app</div>
        </div>
      ),
      { ...size },
    );
  }

  const team = TEAM_BY_CODE[view.teamCode];
  const teamName = team?.name ?? view.teamCode;
  const [flag, headshot] = await Promise.all([
    flagDataUri(view.teamCode),
    imgDataUri(await getPlayerImage(view.player, view.teamCode).catch(() => null)),
  ]);
  const info = view.info;
  const goals = info?.goals ?? view.goldenBoot?.goals ?? 0;
  const assists = info?.assists ?? view.assists?.assists ?? 0;
  const penalties = info?.penalties ?? view.goldenBoot?.penalties ?? 0;
  const appearances = info?.appearances ?? 0;
  const position = info?.position ? POSITION[info.position] : "";
  const gb = view.goldenBoot;

  // The Golden Boot standing is the strongest hook when present — rank now, or "won" once clinched.
  const bootLine =
    gb && view.gbRank != null && goals > 0
      ? gb.clinched
        ? "Golden Boot winner"
        : gb.eliminated
          ? `#${view.gbRank} in the Golden Boot race`
          : `#${view.gbRank} in the Golden Boot race · ${ogPct(gb.winProb)} to win it`
      : null;

  const stats: { label: string; value: string; accent?: boolean }[] = [
    { label: "Goals", value: String(goals), accent: goals > 0 },
    { label: "Assists", value: String(assists) },
    { label: "Penalties", value: String(penalties) },
    { label: "Apps", value: String(appearances) },
  ];

  const FLAG_W = 132;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: OG_BG, color: OG_FG, fontFamily: "sans-serif" }}>
        {/* eyebrow */}
        <div style={{ display: "flex", fontSize: 25, letterSpacing: 4, color: OG_GREEN, fontWeight: 600 }}>
          {teamName.toUpperCase()} · WORLD CUP 2026
        </div>

        {/* name + flag (left) · headshot (right) */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flex: 1, gap: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 40, minWidth: 0 }}>
            {flag && <img src={flag} style={{ width: FLAG_W, height: Math.round((FLAG_W * 3) / 4), borderRadius: 14, border: "1px solid rgba(255,255,255,0.18)", objectFit: "cover" }} />}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ display: "flex", fontSize: 78, fontWeight: 700, letterSpacing: -2, lineHeight: 1.02 }}>{view.player}</div>
              <div style={{ display: "flex", fontSize: 32, color: OG_MUTED, marginTop: 14 }}>
                {position ? `${position} · ${teamName}` : teamName}
              </div>
              {bootLine && (
                <div style={{ display: "flex", fontSize: 27, color: gb?.clinched ? OG_GOLD : OG_GREEN, fontWeight: 600, marginTop: 18 }}>{bootLine}</div>
              )}
            </div>
          </div>
          {headshot && <img src={headshot} style={{ height: 330, objectFit: "contain" }} />}
        </div>

        {/* stat strip */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 56 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 19, letterSpacing: 2, color: OG_MUTED, fontWeight: 600 }}>{s.label.toUpperCase()}</div>
                <div style={{ display: "flex", fontSize: 52, fontWeight: 700, color: s.accent ? OG_GREEN : OG_FG, marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", color: "#8aa394", fontSize: 26 }}>worldcup2026predictions.app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
