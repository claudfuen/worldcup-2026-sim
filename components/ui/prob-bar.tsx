import { cn } from "@/lib/utils";

// The one probability-as-magnitude bar used across the overview — the shared visual language that makes the
// page read as a single system. An honest, ABSOLUTE-domain meter: width is value/max on a fixed scale shared
// by every peer bar, never normalized to the current leader (a maxed bar beside a sub-100% number reads as
// certainty, and sim probabilities are never certain). A calm track with a solid, semantic fill that grows
// from zero once on load — the "simulation resolving" signature. Purely presentational (aria-hidden): the
// adjacent number is the accessible value.
export type BarHue = "primary" | "contention" | "data-cool" | "win";

const FILL: Record<BarHue, { solid: string; dim: string }> = {
  primary: { solid: "bg-primary", dim: "bg-primary/45" },
  contention: { solid: "bg-contention", dim: "bg-contention/45" },
  "data-cool": { solid: "bg-data-cool", dim: "bg-data-cool/45" },
  win: { solid: "bg-win", dim: "bg-win/50" },
};

const HEIGHT = { xs: "h-1", sm: "h-1.5", md: "h-2", lg: "h-2.5" } as const;

export function ProbBar({
  value,
  max = 1,
  hue = "primary",
  size = "sm",
  dim = false,
  grow = true,
  className = "",
}: {
  value: number;
  /** The absolute domain ceiling this bar is measured against (shared across peer bars). */
  max?: number;
  hue?: BarHue;
  size?: keyof typeof HEIGHT;
  /** Render the fill at reduced weight (e.g. non-leader rows). */
  dim?: boolean;
  /** Animate the fill from zero on load (the one earned signature motion). */
  grow?: boolean;
  className?: string;
}) {
  const w = Math.max(3, Math.min(value / max, 1) * 100);
  return (
    <span className={cn("bg-foreground/8 relative block overflow-hidden rounded-full", HEIGHT[size], className)} aria-hidden>
      <span
        className={cn("absolute inset-y-0 left-0 origin-left rounded-full", grow && "bar-grow", dim ? FILL[hue].dim : FILL[hue].solid)}
        style={{ width: `${w}%` }}
      />
    </span>
  );
}
