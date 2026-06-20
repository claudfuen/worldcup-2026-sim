# World Cup 2026 Oracle

Monte Carlo predictions for the 2026 FIFA World Cup: probability each team wins its group, advances, and reaches each knockout round - recomputed periodically from live results.

## How it works

1. **Live data** - pulls completed results from ESPN's public `fifa.world` feed (no API key).
2. **Ratings** - World-Football Elo seeded from ~49k internationals (1872-present), updated after every match. Tournament-weighted K, margin-of-victory multiplier, +70 home edge on non-neutral matches. Backtested at **RPS ~0.178 overall / ~0.199 on World Cup matches** (bookmaker-competitive).
3. **Match model** - the Elo gap maps to expected goal supremacy + total goals, then a Poisson (Dixon-Coles) scoreline distribution. Yields both W/D/L and scorelines (needed for goal-difference tiebreakers).
4. **Monte Carlo** - ~20k simulations of every remaining match. Each run computes group tables with the **2026 FIFA tiebreakers** (head-to-head *before* overall goal difference - a 2026 rule change), selects the 8 best third-placed teams, applies the verified **495-row Annex C assignment table**, then simulates the full knockout bracket to a champion.
5. **Storage** - aggregated probabilities written to Vercel KV (Upstash Redis); the dashboard reads from KV.

## Architecture

- `lib/sim/*` - pure simulation engine (Elo, Poisson, 2026 tiebreakers, third-place assignment, bracket, Monte Carlo).
- `lib/data/*` - verified static data (48 teams + pre-tournament Elo, bracket template, 495-row table, rules).
- `lib/espn.ts` - live ingestion + rating replay. `lib/kv.ts` - Upstash REST client. `lib/predictions.ts` - end-to-end pipeline.
- `app/api/cron/recompute` - Vercel Cron target. `app/api/predictions` - JSON read. `app/page.tsx` - dashboard.

## Develop

```bash
bun install
bun run test        # vitest: tiebreakers, third-place table, bracket, model, full sim
bun run dev
```

Env (see `.env.local`): `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `CRON_SECRET`.

Not affiliated with FIFA. Ratings/data for entertainment.
