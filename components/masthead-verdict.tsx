import Link from "next/link";
import { Flag } from "@/components/flag";
import { Delta } from "@/components/delta";
import { ProbBar } from "@/components/ui/prob-bar";
import { forecastPct, TITLE_BAR_MAX } from "@/lib/format";
import { slugForCode } from "@/lib/slug";
import { getT, getLocale, getIntlLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import { decidedOnPens } from "@/lib/penalties";
import type { MatchInfo, TeamPrediction } from "@/lib/predictions";

// The masthead — "the 20,000 simulations, made visible." The model's call is no longer stated in prose; it is
// SHOWN as a display-scale contender leaderboard inside a lit featured pane, fusing the headline verdict, the
// title race and the day's movement into one lede-and-evidence unit that unambiguously wins the first
// viewport. Honest by construction: every bar shares the absolute TITLE_BAR_MAX domain (never normalized to
// the leader, which would read as certainty), and the "champion" state is sourced from the settled final, not
// the sim — so a probability is never presented as definitive.
export async function MastheadVerdict({
  teams,
  iterations,
  complete,
  champion,
  finalMatch,
}: {
  teams: TeamPrediction[];
  iterations: number;
  complete?: boolean;
  champion?: string;
  finalMatch?: MatchInfo;
}) {
  const t = await getT();
  const locale = await getLocale();
  const intl = await getIntlLocale();
  const [c1, c2] = teams;
  if (!c1) return null;

  // ---- Champion crowned: a settled fact — gold pane, trophy, no probability ----
  const champ = complete && champion ? teams.find((tm) => tm.code === champion) : undefined;
  if (champ) {
    const finalOnPens = finalMatch && decidedOnPens(finalMatch) && finalMatch.homePens != null && finalMatch.awayPens != null;
    const champPens = finalOnPens ? (finalMatch!.winner === finalMatch!.home ? finalMatch!.homePens! : finalMatch!.awayPens!) : null;
    const oppPens = finalOnPens ? (finalMatch!.winner === finalMatch!.home ? finalMatch!.awayPens! : finalMatch!.homePens!) : null;
    return (
      <Pane hue="contention">
        <div className="eyebrow text-contention">{t("home.championEyebrow")}</div>
        <h1 className="hero-headline mt-2 flex items-center gap-3 font-semibold tracking-tight text-balance">
          <TrophyIcon />
          <span>
            <Link href={localeHref(locale, `/team/${slugForCode(champ.code)}`)} className="decoration-contention/40 underline-offset-4 hover:underline">{champ.name}</Link>{" "}
            <span className="text-muted-foreground font-normal">{t("home.areChampions")}</span>
          </span>
        </h1>
        <div className="mt-4 flex items-center gap-2.5">
          <Flag code={champ.code} size={24} />
          <span className="text-muted-foreground text-sm text-pretty sm:text-base">
            {finalOnPens ? t("home.championOnPens", { score: `${champPens}–${oppPens}` }) : t("home.championLine")}
          </span>
        </div>
      </Pane>
    );
  }

  const close = c2 != null && c1.title - c2.title < 0.02;
  const contenders = teams.slice(0, 6);

  return (
    <Pane hue="primary" watermark={c1.code}>
      <div className="eyebrow text-primary">{t("home.modelsCall")}</div>
      <h1 className="hero-headline mt-2 font-semibold tracking-tight text-balance">
        {close ? (
          t("home.tooCloseToCall")
        ) : (
          <>
            <Link href={localeHref(locale, `/team/${slugForCode(c1.code)}`)} className="decoration-primary/40 underline-offset-4 hover:underline">{c1.name}</Link>{" "}
            <span className="text-muted-foreground font-normal">{t("home.toWinItAll")}</span>
          </>
        )}
      </h1>

      {/* The field, shown. Row 1 is the featured pick with the page's one monumental figure; the chasing pack
          follows as a compact leaderboard — every bar on the same honest absolute scale, so 24% is the same
          length here as anywhere else on the page. */}
      <ol className="mt-6 sm:mt-7">
        {contenders.map((tm, i) =>
          i === 0 ? (
            <li key={tm.code}>
              <Link href={localeHref(locale, `/team/${slugForCode(tm.code)}`)} className="group border-border/50 flex items-center gap-3 border-b pb-4 sm:gap-4">
                <Flag code={tm.code} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="group-hover:text-primary truncate text-lg font-semibold sm:text-xl">{tm.name}</span>
                    <Delta v={tm.titleDelta} />
                  </div>
                  <ProbBar value={tm.title} max={TITLE_BAR_MAX} hue="primary" size="md" className="mt-2 max-w-md" />
                </div>
                <span className="text-primary shrink-0 font-mono text-[clamp(2.25rem,8vw,3.25rem)] leading-none font-semibold tracking-tight tabular-nums">{forecastPct(tm.title)}</span>
              </Link>
            </li>
          ) : (
            <li key={tm.code}>
              <Link href={localeHref(locale, `/team/${slugForCode(tm.code)}`)} className="group hover:bg-muted/20 -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2">
                <span className="text-muted-2 w-3 shrink-0 text-right font-mono text-xs tabular-nums">{i + 1}</span>
                <Flag code={tm.code} size={20} />
                <span className="text-muted-foreground group-hover:text-foreground min-w-0 flex-1 truncate text-base">{tm.name}</span>
                <ProbBar value={tm.title} max={TITLE_BAR_MAX} hue="primary" dim size="sm" className="w-14 shrink-0 sm:w-28" />
                <span className="text-muted-foreground w-11 shrink-0 text-right font-mono text-lg tabular-nums">{forecastPct(tm.title)}</span>
                <span className="w-7 shrink-0">
                  <Delta v={tm.titleDelta} />
                </span>
              </Link>
            </li>
          ),
        )}
      </ol>

      <p className="text-muted-foreground mt-6 max-w-2xl text-sm text-pretty sm:text-base">
        {t("home.simsTagline", { count: iterations.toLocaleString(intl) })}
      </p>
    </Pane>
  );
}

// The featured surface every masthead state sits on: a lit, hairline-strong-bordered pane with a state-tinted
// radial glow and — for the call — a large, faint national-flag watermark of the favourite (desktop only, so
// it never crowds the phone fold). Depth from light + border, never a drop shadow (dark-mode rule).
function Pane({ children, hue, watermark }: { children: React.ReactNode; hue: "primary" | "contention"; watermark?: string }) {
  const glow = hue === "contention" ? "--contention" : "--primary";
  return (
    <div className="border-border-strong bg-card card-surface hero-sheen relative overflow-hidden rounded-3xl border px-5 py-7 sm:px-8 sm:py-9 dark:inset-ring dark:inset-ring-white/8">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: `radial-gradient(42rem 20rem at 12% -30%, color-mix(in oklab, var(${glow}) 13%, transparent), transparent 70%)` }}
        aria-hidden
      />
      {watermark && (
        <div className="pointer-events-none absolute -top-10 -right-10 hidden opacity-[0.06] blur-[2px] sm:block" aria-hidden>
          <Flag code={watermark} size={190} />
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

// Gold trophy for the champion crown.
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-contention shrink-0" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}
