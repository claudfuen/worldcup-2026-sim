// relativeDay(): the friendly relative-day label used by the score ticker. Verifies the day-bucketing
// (tonight / tomorrow / yesterday / weekday / date), the daytime-today "no word" case, the 05:00 night
// rollover (a 1 AM kickoff is still "tonight"), and timezone-awareness (same instant → different label in
// different zones). relativeDay is pure given an explicit `nowIso`, so these are deterministic.
import { describe, it, expect } from "vitest";
import { relativeDay, type Zone } from "../lib/format";

const ET: Zone = { tz: "America/New_York", locale: "en-US" }; // EDT = UTC-4 in late June
// Reference "now": 2026-06-30 14:00 EDT (a Tuesday afternoon).
const NOW = "2026-06-30T18:00:00Z";

describe("relativeDay", () => {
  it("daytime match today → no day word (the time alone reads as today)", () => {
    // 2026-06-30 17:00 EDT
    expect(relativeDay("2026-06-30T21:00:00Z", ET, NOW)).toEqual({});
  });

  it("evening match today → tonight", () => {
    // 2026-06-30 21:00 EDT (= 01:00Z next day)
    expect(relativeDay("2026-07-01T01:00:00Z", ET, NOW)).toEqual({ key: "tonight" });
  });

  it("1 AM kickoff is still TONIGHT, not tomorrow (05:00 rollover)", () => {
    // 2026-07-01 01:00 EDT (= 05:00Z) — calendar-tomorrow, but the small hours of tonight.
    expect(relativeDay("2026-07-01T05:00:00Z", ET, NOW)).toEqual({ key: "tonight" });
  });

  it("4:59 AM is still tonight; 5:00 AM has rolled over to a new day", () => {
    // 04:30 EDT Jul 1 → tonight
    expect(relativeDay("2026-07-01T08:30:00Z", ET, NOW)).toEqual({ key: "tonight" });
    // 06:00 EDT Jul 1 → that's tomorrow morning (past the rollover), daytime → tomorrow
    expect(relativeDay("2026-07-01T10:00:00Z", ET, NOW)).toEqual({ key: "tomorrow" });
  });

  it("tomorrow afternoon → tomorrow", () => {
    // 2026-07-01 13:00 EDT
    expect(relativeDay("2026-07-01T17:00:00Z", ET, NOW)).toEqual({ key: "tomorrow" });
  });

  it("yesterday → yesterday", () => {
    // 2026-06-29 13:00 EDT
    expect(relativeDay("2026-06-29T17:00:00Z", ET, NOW)).toEqual({ key: "yesterday" });
  });

  it("later this week → localized weekday", () => {
    // 2026-07-03 13:00 EDT is a Friday
    expect(relativeDay("2026-07-03T17:00:00Z", ET, NOW)).toEqual({ text: "Friday" });
  });

  it("beyond a week → month + day", () => {
    // 2026-07-10 13:00 EDT
    expect(relativeDay("2026-07-10T17:00:00Z", ET, NOW)).toEqual({ text: "Jul 10" });
  });

  it("is timezone-aware: the same instant can be tonight in one zone and tomorrow in another", () => {
    const TOKYO: Zone = { tz: "Asia/Tokyo", locale: "en-US" }; // JST = UTC+9
    // 03:00Z Jul 1 = 23:00 EDT Jun 30 (tonight in ET) but 12:00 JST Jul 1 (tomorrow midday in Tokyo).
    const instant = "2026-07-01T03:00:00Z";
    expect(relativeDay(instant, ET, NOW)).toEqual({ key: "tonight" });
    expect(relativeDay(instant, TOKYO, NOW)).toEqual({ key: "tomorrow" });
  });
});
