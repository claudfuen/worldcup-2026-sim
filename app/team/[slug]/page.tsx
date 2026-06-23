import Link from "next/link";
import { notFound } from "next/navigation";
import { getPredictions } from "@/lib/getPredictions";
import { getLiveMatches, overlayLive, liveActivity } from "@/lib/live";
import { TEAMS } from "@/lib/data/teams";
import { teamSlug, teamFromSlug } from "@/lib/slug";
import { Flag } from "@/components/flag";
import { ShareBar } from "@/components/share-bar";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { LocalTime } from "@/components/local-time";
import { AdvanceBadge } from "@/components/view/advance-badge";
import { teamAdvanceDisplay } from "@/lib/view/advance";
import { isClinched } from "@/lib/view/types";
import { forecastPct } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // per-request live overlay: a finished match shows its score at once

export function generateStaticParams() {
  return TEAMS.map((t) => ({ slug: teamSlug(t.name) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = teamFromSlug(slug);
  if (!team) return { title: "Team" };
  const canonical = `/team/${teamSlug(team.name)}`;
  const title = `${team.name} World Cup 2026 - Odds, Group & Path to the Final`;
  const description = `${team.name}'s 2026 World Cup chances: live title odds, advancement probability, Group ${team.group} standing, and projected knockout path, from 20,000 Monte Carlo simulations.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const ROUND_LABELS: [keyof RoundVals, string][] = [
  ["advance", "Round of 32"],
  ["r16", "Round of 16"],
  ["qf", "Quarter-final"],
  ["sf", "Semi-final"],
  ["final", "Final"],
  ["title", "Champion"],
];
type RoundVals = { advance: number; r16: number; qf: number; sf: number; final: number; title: number };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = teamFromSlug(slug);
  if (!team) notFound();
  const [data, live] = await Promise.all([getPredictions(), getLiveMatches()]);
  const pred = data.teams.find((t) => t.code === team.code);
  const rank = data.teams.findIndex((t) => t.code === team.code) + 1;
  const groupView = data.groups.find((g) => g.group === team.group);
  const row = groupView?.teams.find((t) => t.code === team.code);
  const fixtures = overlayLive(data.matches, live)
    .filter((m) => m.round === "GROUP" && (m.home === team.code || m.away === team.code))
    .sort((a, b) => a.utc.localeCompare(b.utc));
  const opp = (data.r32Opponents[team.code] ?? [])[0];

  const advancePct = pred ? forecastPct(pred.advance) : "-";
  const titlePct = pred ? forecastPct(pred.title) : "-";
  // A clinched Round-of-32 place is a FACT (✓), never a capped forecast %. Derived from the SAME
  // AdvanceDisplay union the standings cell renders, so the funnel/lede can never disagree with the table.
  const advanceDisp = row ? teamAdvanceDisplay(row, groupRank(groupView, team.code) - 1) : undefined;
  const advanceClinched = !!advanceDisp && isClinched(advanceDisp);
  const advanceOut = advanceDisp?.kind === "eliminated";
  const statusWord =
    row?.status === "won_group" ? "have won the group"
      : row?.status === "second" ? "have clinched a top-2 spot"
      : row?.status === "advanced" ? "have qualified for the knockouts"
      : row?.status === "eliminated" ? "have been eliminated"
      : `are ${row ? ordinal(groupRank(groupView, team.code)) : ""} in Group ${team.group}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <LiveAutoRefresh enabled={liveActivity(data.matches, live)} />
      <Link href="/groups" className="text-muted-foreground hover:text-foreground text-sm">← Groups</Link>
      <header className="mt-3">
        <div className="text-primary font-mono text-xs font-semibold tracking-wide uppercase">World Cup 2026 · Group {team.group}</div>
        <div className="mt-1.5 flex items-center gap-3">
          <Flag code={team.code} size={40} />
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{team.name} at the World Cup 2026</h1>
        </div>
        {pred && (
          <p className="text-muted-foreground mt-3 text-sm text-pretty">
            {team.name} {statusWord}
            {advanceOut ? (
              <> - out of the 2026 World Cup, finishing outside Group {team.group}&apos;s qualifying places.</>
            ) : advanceClinched ? (
              <>, with a <span className="text-foreground font-medium">{titlePct}</span> chance to
              win the tournament - the <span className="text-foreground font-medium">{ordinal(rank)}</span>-most-likely champion
              of 48 teams, across {data.iterations.toLocaleString()} simulations.</>
            ) : (
              <>, with a <span className="text-foreground font-medium">{advancePct}</span> chance to reach the Round of 32 and
              a <span className="text-foreground font-medium">{titlePct}</span> chance to win the tournament - the{" "}
              <span className="text-foreground font-medium">{ordinal(rank)}</span>-most-likely champion of 48 teams, across{" "}
              {data.iterations.toLocaleString()} simulations.</>
            )}
          </p>
        )}
        {pred && (
          <div className="mt-4">
            <ShareBar
              text={
                advanceClinched
                  ? `${team.name} are through to the World Cup 2026 knockouts, with a ${titlePct} chance to win it (model).`
                  : advanceOut
                    ? `${team.name} are out of the 2026 World Cup.`
                    : `${team.name}: ${advancePct} to reach the World Cup 2026 knockouts, ${titlePct} to win it (model).`
              }
              path={`/team/${slug}`}
            />
          </div>
        )}
      </header>

      {pred && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">Chance of reaching each round</h2>
          <div className="border-border bg-card grid grid-cols-3 gap-px overflow-hidden rounded-2xl border sm:grid-cols-6">
            {ROUND_LABELS.map(([key, label]) => {
              const v = (pred as unknown as RoundVals)[key];
              const r32Clinched = key === "advance" && advanceClinched;
              const r32Out = key === "advance" && advanceOut;
              return (
                <div key={key} className="bg-card flex flex-col items-center gap-1 px-2 py-4" style={{ backgroundColor: heat(r32Clinched ? 1 : v) }}>
                  <span className="text-muted-2 text-[10px] font-medium tracking-wide uppercase">{label}</span>
                  <span className={`font-mono text-lg font-bold tabular-nums ${r32Clinched ? "text-win" : key === "title" ? "text-primary" : ""}`}>
                    {r32Clinched ? <span title="Clinched a Round-of-32 place">✓</span> : r32Out ? "out" : forecastPct(v)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {groupView && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">Group {team.group} standings</h2>
            <Link href={`/group/${team.group.toLowerCase()}`} className="text-primary text-xs">Full group →</Link>
          </div>
          <div className="border-border bg-card overflow-hidden rounded-2xl border">
            <table className="w-full text-sm">
              <tbody>
                {groupView.teams.map((t, i) => {
                  const me = t.code === team.code;
                  return (
                    <tr key={t.code} className={`border-border/50 border-b last:border-0 ${me ? "bg-primary/[0.06]" : ""} ${i < 2 ? "border-l-win" : i === 2 ? "border-l-contention" : "border-l-transparent"} border-l-2`}>
                      <td className="py-2 pr-1 pl-3 text-muted-2 w-6 font-mono text-[11px]">{i + 1}</td>
                      <td className="py-2">
                        <Link href={`/team/${teamSlug(t.name)}`} className="flex items-center gap-2 hover:underline">
                          <Flag code={t.code} size={18} />
                          <span className={`truncate text-[13px] ${me ? "font-semibold" : "font-medium"}`}>{t.name}</span>
                        </Link>
                      </td>
                      <td className="px-1 text-center font-mono text-xs tabular-nums text-muted-foreground">{t.played}</td>
                      <td className="px-1 text-center font-mono text-xs tabular-nums">{t.gd >= 0 ? "+" : ""}{t.gd}</td>
                      <td className="px-1 text-center font-mono text-[13px] font-bold tabular-nums">{t.pts}</td>
                      <td className="px-2 pr-3 text-right">
                        <AdvanceBadge d={teamAdvanceDisplay(t, i)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {opp && !advanceOut && (
            <p className="text-muted-2 mt-3 text-xs">
              Most likely Round-of-32 opponent: <span className="text-foreground/80">{opp.name}</span> ({forecastPct(opp.prob)}).
            </p>
          )}
        </section>
      )}

      {fixtures.length > 0 && (
        <section className="mt-8">
          <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">{team.name}&apos;s group matches</h2>
          <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border">
            {fixtures.map((m) => {
              const final = m.status === "final";
              const live = m.status === "live";
              const oppName = m.home === team.code ? m.awayName : m.homeName;
              const oppCode = m.home === team.code ? m.away : m.home;
              return (
                <Link key={m.match} href={`/match/${m.match}`} className="hover:bg-muted/30 flex items-center gap-3 px-4 py-2.5 transition-colors">
                  <span className="text-muted-2 w-24 shrink-0 font-mono text-[11px]"><LocalTime utc={m.utc} mode="day" /></span>
                  <span className="text-muted-foreground text-xs">vs</span>
                  <Flag code={oppCode} size={18} />
                  <span className="min-w-0 flex-1 truncate text-sm">{oppName}</span>
                  {final || live ? (
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {m.home === team.code ? m.homeScore : m.awayScore}–{m.home === team.code ? m.awayScore : m.homeScore}
                    </span>
                  ) : m.favorite ? (
                    <span className="text-muted-2 shrink-0 text-[11px]">{m.favorite.code === team.code ? "favored" : ""}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-muted-2 mt-8 text-xs">
        Odds from a World Football Elo + Poisson model, {data.iterations.toLocaleString()} Monte Carlo simulations, updated live.{" "}
        <Link href="/methodology" className="text-primary">How it works →</Link>
      </p>
    </main>
  );
}

function heat(v: number): string {
  return `color-mix(in oklab, var(--primary) ${Math.round(Math.min(v, 1) * 22)}%, transparent)`;
}
function groupRank(gv: { teams: { code: string }[] } | undefined, code: string): number {
  return (gv?.teams.findIndex((t) => t.code === code) ?? 0) + 1;
}
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
