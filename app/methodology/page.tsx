export const dynamic = "force-dynamic";

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
      <div className="mt-6 space-y-6 text-sm leading-relaxed">
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
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 font-semibold">{title}</h2>
      <p className="text-muted-foreground [&_b]:text-foreground [&_i]:text-foreground/90">{children}</p>
    </section>
  );
}
