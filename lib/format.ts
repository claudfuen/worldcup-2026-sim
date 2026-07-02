// Match times default to US Eastern (the host region) for server render and no-JS, but every
// display passes the viewer's resolved zone so times render in their own local time + locale.
const DEFAULT_TZ = "America/New_York";
const DEFAULT_LOCALE = "en-US";

export type Zone = { tz?: string; locale?: string };

const tzOf = (z?: Zone) => z?.tz || DEFAULT_TZ;
const localeOf = (z?: Zone) => z?.locale || DEFAULT_LOCALE;

// Short zone label for the resolved time, e.g. "EDT", "PST", "GMT+1".
export function zoneLabel(utc: string, z?: Zone): string {
  const parts = new Intl.DateTimeFormat(localeOf(z), { timeZone: tzOf(z), timeZoneName: "short" }).formatToParts(new Date(utc));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

export function fmtDateTime(utc: string, z?: Zone): string {
  const s = new Date(utc).toLocaleString(localeOf(z), {
    timeZone: tzOf(z), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return `${s} ${zoneLabel(utc, z)}`;
}

export function fmtTime(utc: string, z?: Zone): string {
  return new Date(utc).toLocaleString(localeOf(z), { timeZone: tzOf(z), hour: "numeric", minute: "2-digit" }) + ` ${zoneLabel(utc, z)}`;
}

// Time without the zone suffix, for dense lists where context already implies the zone.
export function fmtTimeShort(utc: string, z?: Zone): string {
  return new Date(utc).toLocaleString(localeOf(z), { timeZone: tzOf(z), hour: "numeric", minute: "2-digit" });
}

export function fmtDay(utc: string, z?: Zone): string {
  return new Date(utc).toLocaleString(localeOf(z), { timeZone: tzOf(z), weekday: "short", month: "short", day: "numeric" });
}

// YYYY-MM-DD in the given zone, for grouping the schedule by day. Always en-CA so the key
// is locale-independent numeric; only the timezone varies.
export function fmtDayKey(utc: string, z?: Zone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tzOf(z), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(utc));
}

// A friendly relative day for an instant, in the viewer's zone, relative to `nowIso`. Returns EITHER a
// translation `key` (tonight/tomorrow/yesterday) for the caller to localize, OR a preformatted, already-
// localized `text` (weekday for the rest of this week, else month + day). An empty object means "no day word
// needed" — a daytime match today, where the bare kickoff time already reads as today. Used by the ticker so a
// later kickoff shows "Tomorrow 12:00 PM" / "Tonight 9:00 PM" instead of a terse "WED, JUL 1 12:00 PM".
//
// The "day" rolls over at NIGHT_ROLLOVER (05:00 local), not midnight — so a 1:00 AM kickoff counts as part of
// the previous evening's night, i.e. still "tonight". We compare days on this shifted calendar (both the match
// and "now" shifted identically), and a match is "tonight" when it falls in the current night window
// (evening ≥18:00, or the small hours <05:00).
const NIGHT_ROLLOVER_H = 5;
export function relativeDay(utc: string, z: Zone | undefined, nowIso: string): { key?: string; text?: string } {
  const tz = tzOf(z);
  // The "sports day" key: shift the instant back NIGHT_ROLLOVER_H hours so the local day boundary is 05:00.
  const eff = (iso: string) => fmtDayKey(new Date(Date.parse(iso) - NIGHT_ROLLOVER_H * 3600000).toISOString(), z);
  const matchKey = eff(utc);
  const todayKey = eff(nowIso);
  const tomorrowKey = eff(new Date(Date.parse(nowIso) + 86400000).toISOString());
  const yesterdayKey = eff(new Date(Date.parse(nowIso) - 86400000).toISOString());
  // Local hour of the match (h23 → midnight is 0, never 24), to tell a daytime match from a night one.
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(utc)));
  const isNight = hour >= 18 || hour < NIGHT_ROLLOVER_H;
  if (matchKey === todayKey) return { key: isNight ? "tonight" : "today" }; // ticker suppresses a plain "today"
  if (matchKey === tomorrowKey) return { key: "tomorrow" };
  if (matchKey === yesterdayKey) return { key: "yesterday" };
  const diffDays = Math.round((Date.parse(matchKey) - Date.parse(todayKey)) / 86400000);
  if (diffDays > 1 && diffDays <= 6) return { text: new Date(utc).toLocaleString(localeOf(z), { timeZone: tz, weekday: "long" }) };
  return { text: new Date(utc).toLocaleString(localeOf(z), { timeZone: tz, month: "short", day: "numeric" }) };
}

// Localized ordinal, e.g. en 1st/2nd/3rd, es 1.º, fr 1er/2e, de 1., it 1º, pt 1º, ru 1-й, hi 1वाँ,
// id ke-1, ja/zh 第1, ko 1위, ar 1. Returns a COMPLETE display ordinal — callers interpolate it whole
// (do not append a suffix in the message catalog). `locale` is a BCP-47 tag; only the language matters.
const ORD_EN: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
export function ordinal(n: number, locale = DEFAULT_LOCALE): string {
  const lang = locale.split("-")[0];
  switch (lang) {
    case "en":
      return `${n}${ORD_EN[new Intl.PluralRules("en", { type: "ordinal" }).select(n)] ?? "th"}`;
    case "fr":
      return n === 1 ? "1er" : `${n}e`;
    case "es":
      return `${n}.º`;
    case "it":
    case "pt":
      return `${n}º`;
    case "de":
      return `${n}.`;
    case "ru":
      return `${n}-й`;
    case "hi":
      return `${n}वाँ`;
    case "id":
      return `ke-${n}`;
    case "ja":
    case "zh":
      return `第${n}`;
    case "ko":
      return `${n}위`;
    default: // ar + any fallback: a bare number reads fine in a stats context
      return `${n}`;
  }
}

export function pct(v: number): string {
  if (v >= 0.9995) return "100%";
  if (v > 0 && v < 0.005) return "<1%";
  return `${Math.round(v * 100)}%`;
}

// A Monte Carlo frequency is a forecast, never a guarantee, so it must never render as "100%" - only a
// mathematically-clinched state (shown with a ✓ elsewhere) may. Cap displayed sim probabilities at 99%.
// Returns the branded ForecastLabel (this is its ONLY producer), so a raw/uncapped value can't be passed
// where a capped forecast is expected.
export function forecastPct(v: number): import("./view/types").ForecastLabel {
  return pct(Math.min(v, 0.99)) as import("./view/types").ForecastLabel;
}

// The shared ABSOLUTE domain for every title-probability bar (hero + title race). A single fixed ceiling —
// never normalize a bar to the current leader, which would render #1 as a full bar beside a sub-100% number
// and read as certainty (it isn't — champions come from clinch math, not the sim). 0.40 keeps the strongest
// realistic favourite near-full while the field stays honestly proportional to each other.
export const TITLE_BAR_MAX = 0.4;
