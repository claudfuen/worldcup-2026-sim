"use client";

import { useState } from "react";
import type { OpponentProb } from "@/lib/predictions";
import { fmtPct } from "./bar";

interface TeamOpt {
  code: string;
  name: string;
}

export function OpponentExplorer({
  teams,
  r32Opponents,
  defaultCode = "BRA",
}: {
  teams: TeamOpt[];
  r32Opponents: Record<string, OpponentProb[]>;
  defaultCode?: string;
}) {
  const [code, setCode] = useState(defaultCode);
  const opps = r32Opponents[code] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-muted-foreground text-sm">If this team wins/advances, likely Round-of-32 opponent:</label>
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="border-border bg-background focus:ring-primary/40 rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2"
        >
          {teams.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        {opps.length === 0 && <p className="text-muted-foreground text-sm">No data.</p>}
        {opps.map((o) => (
          <div key={o.code} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm">{o.name}</span>
            <div className="bg-muted/50 relative h-2 w-full max-w-md overflow-hidden rounded-full">
              <div className="bg-primary/80 absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(o.prob * 100)}%` }} />
            </div>
            <span className="text-foreground/80 w-12 text-right font-mono text-xs tabular-nums">{fmtPct(o.prob)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
