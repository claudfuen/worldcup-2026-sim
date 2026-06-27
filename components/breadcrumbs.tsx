import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export type Crumb = { label: string; href?: string };

// Orientation + upward navigation for SEO landers who arrive deep (a match/team/group page) with no
// sense of where they are. Each ancestor is a real link, so every deep page exposes its parents.
export async function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = await getT();
  return (
    <nav aria-label={t("breadcrumbs.ariaLabel")} className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs">
      {items.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-x-1.5">
          {i > 0 && <span className="text-muted-2" aria-hidden>›</span>}
          {c.href ? (
            <Link href={c.href} className="hover:text-foreground -my-1 py-1 transition-colors">{c.label}</Link>
          ) : (
            <span className="text-foreground/70" aria-current="page">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
