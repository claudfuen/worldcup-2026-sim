import type { Metadata } from "next";
import { getPredictions } from "@/lib/getPredictions";
import { AwardsBoard } from "@/components/awards-board";
import { RelatedLinks } from "@/components/related-links";
import { forecastPct } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
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
  // Name the live leader in the SERP snippet — that's what wins the click on "world cup 2026 top scorer".
  // Title stays static (avoids SERP churn); description is the high-leverage dynamic swap.
  const data = await getPredictions().catch(() => null);
  const lead = data?.awards?.goldenBoot?.[0];
  const description = lead?.clinched
    ? t("awards.metaDescWon", { player: lead.player, goals: lead.goals })
    : lead
      ? t("awards.metaDescLeader", { player: lead.player, goals: lead.goals, pct: forecastPct(lead.winProb) })
      : t("awards.metaDesc");
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
  const clinchedCount = goldenBoot.filter((e) => e.clinched).length;
  const verdict = !leader
    ? t("awards.verdictNoData")
    : leader.clinched
      ? clinchedCount > 1
        ? t("awards.verdictWonShared", { player: leader.player, goals: leader.goals })
        : t("awards.verdictWon", { player: leader.player, goals: leader.goals })
      : leadCount > 1
        ? t("awards.verdictTied", { player: leader.player, n: leadCount - 1, goals: leader.goals })
        : t("awards.verdictLeader", { player: leader.player, goals: leader.goals, pct: forecastPct(leader.winProb) });

  // ItemList structured data for the Golden Boot ranking — this is a head-term page ("golden boot odds")
  // and previously shipped no structured data. Built server-side; absolute origin to match the other pages.
  const ORIGIN = "https://worldcup2026predictions.app";
  const itemListLd = goldenBoot.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: t("awards.metaTitle"),
        itemListOrder: "https://schema.org/ItemListOrderDescending",
        numberOfItems: Math.min(10, goldenBoot.length),
        itemListElement: goldenBoot.slice(0, 10).map((e, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Person",
            name: e.player,
            url: `${ORIGIN}${localeHref(locale, `/team/${slugForCode(e.teamCode)}`)}`,
            affiliation: { "@type": "SportsTeam", name: t(`teams.${e.teamCode}`) },
          },
        })),
      }
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />}
      <header className="mb-6">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("awards.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{data.complete ? t("awards.headingFinal") : t("awards.heading")}</h1>
        <p className="text-foreground mt-2 text-base text-pretty">{verdict}</p>
        <p className="text-muted-2 mt-2 text-xs text-pretty">{data.complete ? t("awards.subheadFinal") : t("awards.subhead")}</p>
      </header>

      <Section title={t("awards.goldenBoot")} desc={t("awards.goldenBootDesc")}>
        <AwardsBoard entries={goldenBoot} metric="goals" accent="gold" />
      </Section>

      <Section title={t("awards.playmaker")} desc={t("awards.playmakerDesc")} className="mt-10">
        <AwardsBoard entries={assists} metric="assists" accent="cool" />
      </Section>

      <p className="text-muted-2 mt-6 text-xs text-pretty">
        {data.complete ? t("awards.matchesNoteFinal", { n: matchesCounted }) : t("awards.matchesNote", { n: matchesCounted, iters: "20k" })} {!data.complete && t("awards.footnote")}
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

function Section({ title, desc, className = "", children }: { title: string; desc: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={className}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-2 mt-0.5 mb-3 text-xs text-pretty">{desc}</p>
      {children}
    </section>
  );
}
