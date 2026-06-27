"use client";

import { usePathname } from "next/navigation";
import { splitLocale, type Locale } from "./config";

/**
 * Current locale for a CLIENT component, derived from the URL (the proxy's x-locale header isn't
 * readable client-side). Pair with `localeHref` from config to build locale-correct links, and have
 * server parents pass any TRANSLATED strings down as props (client components can't call getT()).
 */
export function useLocale(): Locale {
  return splitLocale(usePathname() || "/")[0];
}

/** Current locale + the locale-less path (e.g. ["es", "/bracket"]) — for the language switcher. */
export function useLocaleAndPath(): [Locale, string] {
  return splitLocale(usePathname() || "/");
}
