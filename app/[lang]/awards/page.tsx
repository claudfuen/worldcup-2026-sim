import type { Metadata } from "next";
import { getPredictions } from "@/lib/getPredictions";
import { AwardsBoard } from "@/components/awards-board";
import { RelatedLinks } from "@/components/related-links";
import { getT, getLocale } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("awards.metaTitle");
  const description = t("awards.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/awards", locale),
    openGraph: { title, description, url: localeHref(locale, "/awards"), type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function AwardsPage() {
  const t = await getT();
  const locale = await getLocale();
  const data = await getPredictions();
  const { goldenBoot, assists, matchesCounted } = data.awards;

  const leader = goldenBoot[0];
  const leadCount = leader ? goldenBoot.filter((e) => e.goals === leader.goals).length : 0;
  const verdict = !leader
    ? t("awards.verdictNoData")
    : leadCount > 1
      ? t("awards.verdictTied", { player: leader.player, n: leadCount - 1, goals: leader.goals })
      : t("awards.verdictLeader", { player: leader.player, goals: leader.goals, pct: pctText(leader.winProb) });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("awards.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("awards.heading")}</h1>
        <p className="text-foreground mt-2 text-base text-pretty">{verdict}</p>
        <p className="text-muted-2 mt-2 text-xs text-pretty">{t("awards.subhead")}</p>
      </header>

      <Section title={t("awards.goldenBoot")} desc={t("awards.goldenBootDesc")} columns={[t("awards.proj"), t("awards.colChance")]}>
        <AwardsBoard entries={goldenBoot} metric="goals" />
      </Section>

      {assists.length > 0 && (
        <Section title={t("awards.playmaker")} desc={t("awards.playmakerDesc")} columns={[t("awards.proj"), t("awards.colChance")]} className="mt-10">
          <AwardsBoard entries={assists} metric="assists" />
        </Section>
      )}

      <p className="text-muted-2 mt-6 text-xs text-pretty">
        {t("awards.matchesNote", { n: matchesCounted, iters: "20k" })} {t("awards.footnote")}
      </p>

      <RelatedLinks
        links={[
          { label: t("nav.bracket"), href: localeHref(locale, "/bracket"), hint: t("awards.linkBracketHint") },
          { label: t("nav.groups"), href: localeHref(locale, "/groups") },
          { label: t("nav.overview"), href: localeHref(locale, "/") },
        ]}
      />
    </main>
  );
}

function Section({ title, desc, columns, className = "", children }: { title: string; desc: string; columns: string[]; className?: string; children: React.ReactNode }) {
  return (
    <section className={className}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-2 mt-0.5 mb-3 text-xs text-pretty">{desc}</p>
      {/* column hints, right-aligned to the data cluster (desktop only — mobile rows are self-evident) */}
      <div className="text-muted-2 mb-1 hidden items-center justify-end gap-1.5 px-1.5 font-mono text-[10px] tracking-wide uppercase sm:flex">
        <span className="w-14 text-right">{columns[0]}</span>
        <span className="w-[4.5rem] text-right">{columns[1]}</span>
      </div>
      <div className="border-border bg-card rounded-2xl border p-2 dark:inset-ring dark:inset-ring-white/5">{children}</div>
    </section>
  );
}

// Golden Boot win chance, capped at 99% like the rest of the site (a forecast is never a certainty).
function pctText(p: number): string {
  if (p >= 0.995) return "99%";
  if (p > 0 && p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}
