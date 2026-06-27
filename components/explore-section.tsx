import type { ReactNode } from "react";
import Link from "next/link";
import { Flag } from "@/components/flag";
import type { RelLink } from "@/components/related-links";

// The page-foot exploration block: a grid of rich PREVIEW cards (bracket teaser, group tables, title race)
// — real windows into related entities — plus an optional thin row of secondary pill links (teams, schedule).
// Replaces the old text-only "keep exploring" rail so deep landers get a genuine glimpse of where to go next.
export function ExploreSection({
  title = "Explore the tournament",
  children,
  links,
}: {
  title?: string;
  children: ReactNode;
  links?: RelLink[];
}) {
  return (
    <section className="border-border mt-12 border-t pt-8">
      <h2 className="text-muted-foreground mb-4 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{title}</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      {links && links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {links.map((l, i) => (
            <Link
              key={i}
              href={l.href}
              className="border-border bg-card hover:border-primary/45 hover:bg-muted/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors"
            >
              {l.code && <Flag code={l.code} size={16} />}
              <span className="font-medium">{l.label}</span>
              {l.hint && <span className="text-muted-2 text-xs">{l.hint}</span>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
