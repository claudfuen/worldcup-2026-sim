// All match times render in US Eastern (America/New_York), always.
const ET = "America/New_York";

export function etDateTime(utc: string): string {
  const d = new Date(utc);
  return d.toLocaleString("en-US", {
    timeZone: ET, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }) + " ET";
}

export function etTime(utc: string): string {
  return new Date(utc).toLocaleString("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }) + " ET";
}

export function etDay(utc: string): string {
  return new Date(utc).toLocaleString("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric" });
}

// YYYY-MM-DD in ET, for grouping the schedule by day.
export function etDayKey(utc: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(utc));
  return parts;
}

export function pct(v: number): string {
  if (v >= 0.9995) return "100%";
  if (v > 0 && v < 0.005) return "<1%";
  return `${Math.round(v * 100)}%`;
}
