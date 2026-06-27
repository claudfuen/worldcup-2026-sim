import type { Metadata } from "next";
import { ACTIVE_LOCALES, DEFAULT_LOCALE, localeHref, type Locale } from "./config";

/**
 * Centralized canonical + hreflang alternates for a page.
 *
 * Pass the locale-LESS path (e.g. "/bracket", "/team/spain", or "/") and the locale the page is being
 * rendered in. Returns the canonical URL for that locale plus a hreflang map covering every ACTIVE
 * locale + an x-default. Because it iterates ACTIVE_LOCALES, flipping a locale to `ready` in config.ts
 * adds it to EVERY page's hreflang and the sitemap at once — no per-route edits.
 *
 * Paths are relative; `metadataBase` (set in the root layout) makes them absolute.
 */
export function buildAlternates(pathNoLocale: string, currentLocale: Locale): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of ACTIVE_LOCALES) {
    languages[l.hreflang] = localeHref(l.id, pathNoLocale);
  }
  languages["x-default"] = localeHref(DEFAULT_LOCALE, pathNoLocale);
  return { canonical: localeHref(currentLocale, pathNoLocale), languages };
}
