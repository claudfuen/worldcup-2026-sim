export const dynamic = "force-static";

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
      <div className="mt-6 space-y-6 text-sm leading-relaxed">
        <Section title="Ratings — World Football Elo">
          Every team carries an Elo rating seeded from ~49,000 international matches (1872-present) and updated after each
          result. Updates are tournament-weighted (a World Cup match moves ratings more than a friendly), scaled by margin
          of victory, with a home-field adjustment on non-neutral matches. Backtested at <b>RPS ≈ 0.178</b> overall and
          <b> ≈ 0.199</b> on World Cup matches — competitive with betting markets.
        </Section>
        <Section title="Match model — Poisson scorelines">
          The Elo gap between two teams maps to an expected goal supremacy and total, which feed two Poisson goal rates
          (with a Dixon-Coles low-score correction). This yields both win/draw/loss probabilities and full scorelines —
          the latter needed to break group ties on goal difference.
        </Section>
        <Section title="Simulation — Monte Carlo">
          We simulate every remaining match ~20,000 times. Each run builds the 12 group tables using the{" "}
          <b>2026 FIFA tiebreakers</b> (a rule change: head-to-head is applied <i>before</i> overall goal difference),
          selects the 8 best third-placed teams, applies the official 495-row Annex C assignment table, then plays out the
          full knockout bracket to a champion. Probabilities are the share of runs in which each outcome occurs.
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
