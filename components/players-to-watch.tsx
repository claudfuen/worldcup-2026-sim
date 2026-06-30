import Link from "next/link";
import { PlayerAvatar } from "@/components/player-avatar";
import { getPlayerImage } from "@/lib/playerImages";
import { playerSlug } from "@/lib/players";
import type { AwardEntry } from "@/lib/awards";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// The faces of the tournament: a horizontal rail of the standout scorers with their headshots, linking to each
// player's page. Headshots are best-effort (monogram fallback), resolved server-side + KV-cached. Bounded to a
// handful so the homepage never fans out a large number of image lookups.
export async function PlayersToWatch({ entries, className = "" }: { entries: AwardEntry[]; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const top = entries.filter((e) => e.goals > 0).slice(0, 8);
  if (top.length === 0) return null;
  const imgs = await Promise.all(top.map((e) => getPlayerImage(e.player, e.teamCode).catch(() => null)));

  return (
    <section className={className}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("playersToWatch.title")}</h2>
        <Link href={localeHref(locale, "/awards")} className="text-primary shrink-0 text-xs font-medium hover:underline">{t("awards.viewFull")}</Link>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {top.map((e, i) => (
          <Link
            key={`${e.player}-${e.teamCode}`}
            href={localeHref(locale, `/player/${playerSlug(e.player, e.teamCode)}`)}
            className="group border-border bg-card hover:border-primary/50 flex w-32 shrink-0 flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors dark:inset-ring dark:inset-ring-white/5"
          >
            <PlayerAvatar src={imgs[i]} name={e.player} teamCode={e.teamCode} size={72} />
            <div className="w-full min-w-0">
              <div className="truncate text-sm font-medium">{e.player}</div>
              <div className="text-muted-2 mt-0.5 font-mono text-[11px] tabular-nums">{t("playersToWatch.goals", { n: e.goals })}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
