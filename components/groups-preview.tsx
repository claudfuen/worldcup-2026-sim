import Link from "next/link";
import { Flag } from "@/components/flag";
import type { GroupView } from "@/lib/predictions";

// A launchpad tile for the group stage: each group's current leader at a glance + a qualification stat,
// the whole tile linking into /groups. A glimpse, not the full standings.
export function GroupsPreview({ groups, className = "" }: { groups: GroupView[]; className?: string }) {
  const clinched = groups
    .flatMap((g) => g.teams)
    .filter((t) => t.status === "won_group" || t.status === "second" || t.status === "advanced").length;
  return (
    <Link
      href="/groups"
      className={`group border-border bg-card hover:border-primary/50 hover:bg-surface-raised dark:inset-ring dark:inset-ring-white/5 hover:dark:inset-ring-primary/30 flex flex-col rounded-2xl border p-4 transition-colors ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Groups</h2>
        <span className="text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden>→</span>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {groups.map((g) => (
          <div key={g.group} className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-2 w-3 shrink-0 font-mono">{g.group}</span>
            <Flag code={g.teams[0]?.code ?? null} size={14} />
            <span className="text-foreground/80 min-w-0 truncate font-medium">{g.teams[0]?.code}</span>
          </div>
        ))}
      </div>
      <div className="text-muted-2 mt-3 text-xs">{clinched} of 32 Round-of-32 places clinched · standings &amp; odds</div>
    </Link>
  );
}
