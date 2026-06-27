// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE SINGLE SOURCE OF TRUTH for internationalization.
//
// Adding a new language is a TWO-STEP operation and nothing else in the app changes:
//   1. add one entry to LOCALES below,
//   2. drop in lib/i18n/messages/<id>.json (translate en.json) — and the per-locale team names.
//
// Everything locale-aware (the [lang] route, proxy redirect, hreflang, the sitemap, the language
// switcher, RTL handling) loops over this list — it is never hardcoded per route.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export type LocaleConfig = {
  /** URL segment + message-catalog id + the key used everywhere in code. Short + lowercase. */
  id: string;
  /** BCP-47 tag emitted as hreflang / <html lang> — the precise SEO/region signal. */
  hreflang: string;
  /** BCP-47 tag handed to the Intl APIs for number/date/plural formatting. */
  intl: string;
  /** Endonym shown in the language switcher (the language's own name). */
  label: string;
  /** Text direction. */
  dir: "ltr" | "rtl";
  /**
   * Is this locale launched? Only `ready` locales are routed by the proxy, advertised via hreflang,
   * listed in the sitemap, and offered in the switcher. Lets us ship the English refactor (and add a
   * language) before its catalog is translated, without exposing half-done locale URLs to crawlers.
   * Flip to true once lib/i18n/messages/<id>.json is translated.
   */
  ready: boolean;
};

// en is FIRST and is the default — it is served at the root path with no prefix so the existing
// already-indexed URLs (/bracket, /team/spain, …) keep their rankings. Every other locale is prefixed.
export const LOCALES: readonly LocaleConfig[] = [
  { id: "en", hreflang: "en", intl: "en-US", label: "English", dir: "ltr", ready: true },
  { id: "es", hreflang: "es", intl: "es", label: "Español", dir: "ltr", ready: false },
  { id: "pt", hreflang: "pt-BR", intl: "pt-BR", label: "Português", dir: "ltr", ready: false },
  { id: "fr", hreflang: "fr", intl: "fr", label: "Français", dir: "ltr", ready: false },
  { id: "de", hreflang: "de", intl: "de", label: "Deutsch", dir: "ltr", ready: false },
  { id: "it", hreflang: "it", intl: "it", label: "Italiano", dir: "ltr", ready: false },
  { id: "ru", hreflang: "ru", intl: "ru", label: "Русский", dir: "ltr", ready: false },
  // Force Latin digits in Arabic (-u-nu-latn): the UI is percentage-dense and modern Arabic data UIs
  // read Western numerals — Arabic-Indic digits in the stat tables would hurt, not help, comprehension.
  { id: "ar", hreflang: "ar", intl: "ar-u-nu-latn", label: "العربية", dir: "rtl", ready: false },
  { id: "hi", hreflang: "hi", intl: "hi", label: "हिन्दी", dir: "ltr", ready: false },
  { id: "id", hreflang: "id", intl: "id", label: "Bahasa Indonesia", dir: "ltr", ready: false },
  { id: "ja", hreflang: "ja", intl: "ja", label: "日本語", dir: "ltr", ready: false },
  { id: "ko", hreflang: "ko", intl: "ko", label: "한국어", dir: "ltr", ready: false },
  { id: "zh", hreflang: "zh-Hans", intl: "zh-CN", label: "中文", dir: "ltr", ready: false },
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

export const DEFAULT_LOCALE: Locale = "en";

/** Request header the proxy stamps with the resolved locale; read server-side by getLocale(). */
export const LOCALE_HEADER = "x-locale";

export const LOCALE_IDS: readonly Locale[] = LOCALES.map((l) => l.id);

/** Non-default locale ids — the ones that carry a URL prefix. */
export const PREFIXED_LOCALE_IDS: readonly Locale[] = LOCALE_IDS.filter((id) => id !== DEFAULT_LOCALE);

// ── ACTIVE (launched) locales — what the PUBLIC surface uses. Everything user-facing (proxy routing,
// hreflang, sitemap, switcher) iterates these, so an un-`ready` locale is fully invisible to crawlers
// and users until its catalog lands. ──
export const ACTIVE_LOCALES: readonly LocaleConfig[] = LOCALES.filter((l) => l.ready);
export const ACTIVE_LOCALE_IDS: readonly Locale[] = ACTIVE_LOCALES.map((l) => l.id);
export const ACTIVE_PREFIXED_LOCALE_IDS: readonly Locale[] = ACTIVE_LOCALE_IDS.filter(
  (id) => id !== DEFAULT_LOCALE,
);

export function isActiveLocale(value: string | undefined | null): value is Locale {
  return !!value && ACTIVE_LOCALE_IDS.includes(value as Locale);
}

const BY_ID = new Map(LOCALES.map((l) => [l.id, l]));

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && BY_ID.has(value);
}

/** Always returns a config; falls back to the default locale's config for unknown ids. */
export function localeConfig(id: string | undefined | null): LocaleConfig {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_LOCALE)!;
}

export function isRtl(id: string | undefined | null): boolean {
  return localeConfig(id).dir === "rtl";
}

/**
 * Build a path for a locale from a locale-less path (which always starts with "/").
 *   localeHref("en", "/bracket")  -> "/bracket"        (default locale: no prefix)
 *   localeHref("es", "/bracket")  -> "/es/bracket"
 *   localeHref("es", "/")         -> "/es"
 */
export function localeHref(id: Locale, pathNoLocale: string): string {
  const path = pathNoLocale === "" ? "/" : pathNoLocale;
  if (id === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${id}` : `/${id}${path}`;
}

/**
 * Strip a known locale prefix from a pathname, returning [locale, pathNoLocale].
 *   "/es/bracket" -> ["es", "/bracket"]
 *   "/bracket"    -> ["en", "/bracket"]
 *   "/es"         -> ["es", "/"]
 */
export function splitLocale(pathname: string): [Locale, string] {
  const seg = pathname.split("/")[1];
  if (isLocale(seg) && seg !== DEFAULT_LOCALE) {
    const rest = pathname.slice(seg.length + 1);
    return [seg, rest === "" ? "/" : rest];
  }
  return [DEFAULT_LOCALE, pathname === "" ? "/" : pathname];
}
