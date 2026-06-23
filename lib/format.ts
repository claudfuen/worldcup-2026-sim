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

export function pct(v: number): string {
  if (v >= 0.9995) return "100%";
  if (v > 0 && v < 0.005) return "<1%";
  return `${Math.round(v * 100)}%`;
}

// A Monte Carlo frequency is a forecast, never a guarantee, so it must never render as "100%" - only a
// mathematically-clinched state (shown with a ✓ elsewhere) may. Cap displayed sim probabilities at 99%.
export function forecastPct(v: number): string {
  return pct(Math.min(v, 0.99));
}
