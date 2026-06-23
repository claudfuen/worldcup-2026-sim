export const dynamic = "force-dynamic";

const METHOD_TITLE = "How the World Cup 2026 Prediction Model Works";
const METHOD_DESC =
  "How the 2026 World Cup model works: World Football Elo ratings, a Poisson/Dixon-Coles scoreline model, 20,000 Monte Carlo simulations, 2026 tiebreakers, and FIFA Annex C third-place assignment.";
export const metadata = {
  title: { absolute: METHOD_TITLE },
  description: METHOD_DESC,
  alternates: { canonical: "/methodology" },
  openGraph: { title: METHOD_TITLE, description: METHOD_DESC, url: "/methodology", type: "article" },
  twitter: { card: "summary_large_image", title: METHOD_TITLE, description: METHOD_DESC },
};

// One source for the FAQ: rendered visibly below AND emitted as FAQPage JSON-LD, so the rich-result
// markup can never drift from what the page actually shows (a Google requirement for FAQ rich results).
const FAQ: { q: string; a: string }[] = [
  {
    q: "How are the World Cup 2026 predictions calculated?",
    a: "Each team carries a World Football Elo rating built from roughly 49,000 international matches since 1872. The Elo gap between two sides sets their expected goals, which feed a Poisson scoreline model with a Dixon-Coles low-score correction. We then simulate every remaining match about 20,000 times and report how often each outcome occurs.",
  },
  {
    q: "How accurate is the World Cup 2026 prediction model?",
    a: "It backtests at a ranked probability score of about 0.178 overall and 0.199 on World Cup matches, which is competitive with betting markets. No model predicts football with certainty - every figure is a probability, not a guarantee.",
  },
  {
    q: "How do the eight best third-placed teams qualify for the Round of 32?",
    a: "With 12 groups, the top two of each (24 teams) advance automatically. To fill the 32-team Round of 32, the eight best of the twelve third-placed teams also go through, ranked across groups by points, then goal difference, then goals scored. FIFA's fixed Annex C table (495 combinations) then assigns each qualifying third-placed team to a specific group winner.",
  },
  {
    q: "What are the 2026 World Cup group tiebreakers?",
    a: "Teams level on points are separated first by head-to-head record - a 2026 rule change that applies head-to-head before overall goal difference - then by overall goal difference, then goals scored, and finally FIFA ranking.",
  },
  {
    q: "When is a team mathematically guaranteed to advance?",
    a: "Only when no combination of remaining results could overturn it. Because goals are unbounded, anything resting on goal difference can always be flipped by a large enough scoreline, so only points and head-to-head results can lock a place. A clinched outcome is shown with a checkmark, never as 100 percent.",
  },
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

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
      <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
      <div className="mt-6 space-y-7 text-sm leading-relaxed">
        <Section title="Ratings - World Football Elo">
          Every team carries an Elo rating seeded from ~49,000 international matches (1872-present) and updated after each
          result. Updates are tournament-weighted (a World Cup match moves ratings more than a friendly), scaled by margin
          of victory, with a home-field adjustment on non-neutral matches. Backtested at <b>RPS ≈ 0.178</b> overall and
          <b> ≈ 0.199</b> on World Cup matches - competitive with betting markets.
        </Section>
        <Section title="Match model - Poisson scorelines">
          The Elo gap between two teams maps to an expected goal supremacy and total, which feed two Poisson goal rates
          (with a Dixon-Coles low-score correction). Those two rates are the <b>expected goals (xG)</b> shown on each
          match - the model&apos;s average goals for each side, which drive the scoreline distribution. This yields both
          win/draw/loss probabilities and full scorelines - the latter needed to break group ties on goal difference.
          Knockout ties are decided by extra time and then penalties, which the win probabilities account for.
        </Section>
        <Section title="Simulation - Monte Carlo">
          We simulate every remaining match ~20,000 times. Each run builds the 12 group tables using the{" "}
          <b>2026 FIFA tiebreakers</b> (a rule change: head-to-head is applied <i>before</i> overall goal difference),
          selects the 8 best third-placed teams, applies the official 495-row Annex C assignment table, then plays out the
          full knockout bracket to a champion. Probabilities are the share of runs in which each outcome occurs.
        </Section>
        <Section title="How third-placed teams reach the bracket">
          With 12 groups, the top 2 of each (24 teams) advance automatically. To fill the 32-team Round of 32, the{" "}
          <b>8 best of the 12 third-placed teams</b> also go through, ranked across groups by points → goal difference →
          goals scored → FIFA ranking (conduct/fair-play is part of the official tiebreak but isn&apos;t modelled here, so
          we fall straight through to the ranking). The twist: <i>which</i> third-placed team is sent to <i>which</i> group
          winner is not free-form. Only 8 group winners host a third-placed team - the winners of groups{" "}
          <b>A, B, D, E, G, I, K, L</b> - while the winners of C, F, H and J face runners-up instead. FIFA published a
          fixed table (Annex C) with all <b>495</b> possible combinations (one per set of which 8 groups produced a
          qualifying third), assigning each third to a specific winner so that no team meets a side from its own group too
          early. This simulator applies that exact 495-row table every iteration.
        </Section>
        <Section title="Certainty vs. probability">
          A percentage is a forecast; a checkmark is a fact. Group outcomes (win group, advance, eliminated) flip to a
          definitive state only when <b>mathematically</b> guaranteed - we check every remaining win/draw/loss
          combination and claim certainty only when no result could overturn it. Because goals are unbounded, anything
          that would rest on goal difference can always be flipped by a big enough scoreline, so it stays a probability;
          only points and head-to-head results can lock a place. This includes the cross-group math for best-third
          elimination. A clinched outcome is never shown as a mere 100%.
        </Section>
        <Section title="Data">
          Live results, fixtures and venues come from ESPN&apos;s public feed; the bracket structure and third-place table
          were verified against FIFA regulations and Wikipedia. Recomputed periodically. Not affiliated with FIFA.
        </Section>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight">Common questions</h2>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground [&_b]:text-foreground [&_i]:text-foreground/90">{children}</p>
    </section>
  );
}
