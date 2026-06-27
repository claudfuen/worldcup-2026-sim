import Link from "next/link";
import { Flag } from "@/components/flag";
import type { MatchInfo } from "@/lib/predictions";
import { getT, getLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";

// Where a knockout match sits in the bracket: which matches feed into it and where its winner (and, for a
// semi-final, its loser) goes next. Makes a match page a hub you can navigate, and shows what's at stake.
const RX = /^([WL])(\d+)$/;
// Maps this component's round keys to the shared rounds.* namespace.
const ROUND_KEY: Record<string, string> = {
  R32: "rounds.R32", R16: "rounds.R16", QF: "rounds.QF", SF: "rounds.SF", FINAL: "rounds.FINAL", "3P": "rounds.THIRD",
};

// Show the resolved team (bold) or, if the slot is still open, the model's projected favourite (muted), so
// a feeder reads "Germany v Paraguay" rather than "TBD v TBD".
function Side({ code, name, proj, tbd }: { code: string | null; name: string | null; proj?: boolean; tbd: string }) {
  if (!name) return <span className="text-muted-2">{tbd}</span>;
  return <span className={`inline-flex min-w-0 items-center gap-1 ${proj ? "text-muted-foreground" : ""}`}><Flag code={code} size={14} /><span className="truncate">{name}</span></span>;
}

function Matchup({ m, tbd, vs }: { m?: MatchInfo; tbd: string; vs: string }) {
  if (!m) return null;
  const home = m.homeName ? { code: m.home, name: m.homeName } : m.projHome?.[0] ? { code: m.projHome[0].code, name: m.projHome[0].name, proj: true } : { code: null, name: null };
  const away = m.awayName ? { code: m.away, name: m.awayName } : m.projAway?.[0] ? { code: m.projAway[0].code, name: m.projAway[0].name, proj: true } : { code: null, name: null };
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
      <Side code={home.code} name={home.name} proj={home.proj} tbd={tbd} /><span className="text-muted-2">{vs}</span><Side code={away.code} name={away.name} proj={away.proj} tbd={tbd} />
    </span>
  );
}

function PathRow({ to, rel, m2, tbd, vs, href }: { to: number; rel: string; m2?: MatchInfo; tbd: string; vs: string; href: string }) {
  return (
    <Link href={href} className="hover:bg-muted/20 flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground shrink-0 text-xs">{rel}</span>
      <span className="flex min-w-0 items-center gap-2">
        <Matchup m={m2} tbd={tbd} vs={vs} />
        <span className="text-muted-2 shrink-0 font-mono text-[11px]">M{to}</span>
      </span>
    </Link>
  );
}

export async function BracketPath({ m, all }: { m: MatchInfo; all: MatchInfo[] }) {
  if (!(m.round in ROUND_KEY)) return null; // knockout only
  const t = await getT();
  const locale = await getLocale();
  const tbd = t("common.tbd");
  const vs = t("common.vs");
  const byNum = new Map(all.map((x) => [x.match, x]));
  const feeders = [m.slotHome, m.slotAway]
    .map((s) => { const g = s ? RX.exec(s) : null; return g ? { kind: g[1] as "W" | "L", n: Number(g[2]) } : null; })
    .filter((f): f is { kind: "W" | "L"; n: number } => f != null);
  const nextWin = all.find((x) => x.slotHome === `W${m.match}` || x.slotAway === `W${m.match}`);
  const nextLose = all.find((x) => x.slotHome === `L${m.match}` || x.slotAway === `L${m.match}`);
  if (!feeders.length && !nextWin && !nextLose) return null;

  return (
    <section className="mt-8">
      <h2 className="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-[0.1em] uppercase">{t("bracket.pathHeading")}</h2>
      <div className="border-border bg-card divide-border/50 divide-y overflow-hidden rounded-2xl border dark:inset-ring dark:inset-ring-white/5">
        {feeders.map((f) => (
          <PathRow key={f.n} to={f.n} rel={f.kind === "L" ? t("bracket.relLoserOf") : t("bracket.relWinnerOf")} m2={byNum.get(f.n)} tbd={tbd} vs={vs} href={localeHref(locale, `/match/${f.n}`)} />
        ))}
        {nextWin && <PathRow to={nextWin.match} rel={t("bracket.relWinnerTo", { round: t(ROUND_KEY[nextWin.round]) })} m2={nextWin} tbd={tbd} vs={vs} href={localeHref(locale, `/match/${nextWin.match}`)} />}
        {nextLose && <PathRow to={nextLose.match} rel={t("bracket.relLoserTo", { round: t(ROUND_KEY[nextLose.round]) })} m2={nextLose} tbd={tbd} vs={vs} href={localeHref(locale, `/match/${nextLose.match}`)} />}
      </div>
    </section>
  );
}
