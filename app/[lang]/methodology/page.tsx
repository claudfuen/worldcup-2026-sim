import type { Metadata } from "next";
import { getT, getLocale } from "@/lib/i18n/server";
import { buildAlternates } from "@/lib/i18n/links";
import { localeHref } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const locale = await getLocale();
  const title = t("methodology.metaTitle");
  const description = t("methodology.metaDesc");
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates("/methodology", locale),
    openGraph: { title, description, url: localeHref(locale, "/methodology"), type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function MethodologyPage() {
  const t = await getT();

  // One source for the FAQ: rendered visibly below AND emitted as FAQPage JSON-LD, so the rich-result
  // markup can never drift from what the page actually shows (a Google requirement for FAQ rich results).
  const FAQ: { q: string; a: string }[] = [
    { q: t("methodology.faq.calculatedQ"), a: t("methodology.faq.calculatedA") },
    { q: t("methodology.faq.accurateQ"), a: t("methodology.faq.accurateA") },
    { q: t("methodology.faq.thirdQ"), a: t("methodology.faq.thirdA") },
    { q: t("methodology.faq.tiebreakersQ"), a: t("methodology.faq.tiebreakersA") },
    { q: t("methodology.faq.guaranteedQ"), a: t("methodology.faq.guaranteedA") },
  ];

  const FAQ_LD = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
      <header>
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">{t("methodology.eyebrow")}</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("methodology.heading")}</h1>
        <p
          className="text-muted-foreground mt-3 text-base text-pretty"
          dangerouslySetInnerHTML={{ __html: t("methodology.intro") }}
        />
      </header>
      <div className="mt-8 space-y-7 text-sm leading-relaxed">
        <Section title={t("methodology.sections.ratingsTitle")} body={t("methodology.sections.ratingsBody")} />
        <Section title={t("methodology.sections.matchTitle")} body={t("methodology.sections.matchBody")} />
        <Section title={t("methodology.sections.simTitle")} body={t("methodology.sections.simBody")} />
        <Section title={t("methodology.sections.thirdTitle")} body={t("methodology.sections.thirdBody")} />
        <Section title={t("methodology.sections.certaintyTitle")} body={t("methodology.sections.certaintyBody")} />
        <Section title={t("methodology.sections.dataTitle")} body={t("methodology.sections.dataBody")} />
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">{t("methodology.faqHeading")}</h2>
        <dl className="mt-5 space-y-6 text-sm leading-relaxed">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="text-foreground font-semibold">{f.q}</dt>
              <dd className="text-muted-foreground mt-1.5">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold tracking-tight">{title}</h2>
      <p
        className="text-muted-foreground [&_b]:text-foreground [&_i]:text-foreground/90"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </section>
  );
}
