"use client";

import { useState } from "react";
import { Flag } from "@/components/flag";

// A player's headshot (TheSportsDB cutout) with a graceful fallback: if there's no image — or it fails to
// load — we show the player's initials instead, so the slot is never broken or empty. A small country-flag
// badge sits in the corner. The cutout is a transparent PNG, so it sits on a subtle gradient panel.
export function PlayerAvatar({
  src, name, teamCode, size = 72, className = "",
}: {
  src: string | null;
  name: string;
  teamCode: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const showImg = src && !failed;
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div className="from-muted/70 to-card border-border size-full overflow-hidden rounded-2xl border bg-gradient-to-b dark:inset-ring dark:inset-ring-white/5">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover object-top" />
        ) : (
          <div className="text-muted-foreground flex size-full items-center justify-center font-semibold" style={{ fontSize: Math.round(size * 0.34) }}>
            {initials}
          </div>
        )}
      </div>
      <span className="ring-card absolute -right-1 -bottom-1 inline-flex rounded-md ring-2">
        <Flag code={teamCode} size={Math.round(size * 0.3)} />
      </span>
    </div>
  );
}
