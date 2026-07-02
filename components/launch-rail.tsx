import Link from "next/link";
import { ShareBar } from "@/components/share-bar";
import { forecastPct } from "@/lib/format";
import { getT, getLocale, getIntlLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import type { TeamPrediction } from "@/lib/predictions";

// J4 catch-all, demoted from a card grid to one quiet hairline row, plus share + trust/footer copy.
const LINKS = [
  { labelKey: "nav.groups", href: "/groups" },
  { labelKey: "nav.bracket", href: "/bracket" },
  { labelKey: "nav.schedule", href: "/schedule" },
  { labelKey: "footer.myMatches", href: "/matches" },
  { labelKey: "footer.methodology", href: "/methodology" },
];

export async function LaunchRail({ teams, iterations, className = "" }: { teams: TeamPrediction[]; iterations: number; className?: string }) {
  const t = await getT();
  const locale = await getLocale();
  const intl = await getIntlLocale();
  const c1 = teams[0];
  return (
    <footer className={`border-border/60 border-t pt-6 ${className}`}>
      <nav className="flex flex-wrap items-center gap-x-5 font-mono text-xs font-medium tracking-wide uppercase">
        {LINKS.map((l) => (
          <Link key={l.href} href={localeHref(locale, l.href)} className="text-muted-foreground hover:text-foreground inline-flex min-h-10 items-center">{t(l.labelKey)}</Link>
        ))}
      </nav>
      {c1 && (
        <div className="mt-4">
          <ShareBar text={t("home.shareText", { team: c1.name, pct: forecastPct(c1.title), count: iterations.toLocaleString(intl) })} path="/" />
        </div>
      )}
      <p className="text-muted-2 mt-5 text-xs text-pretty">
        {t("home.footerMethod")} <Link href={localeHref(locale, "/methodology")} className="text-primary">{t("home.howItWorks")}</Link>
      </p>
      <p className="text-muted-2 mt-1 text-xs">{t("home.footerDataNote")}</p>
    </footer>
  );
}
