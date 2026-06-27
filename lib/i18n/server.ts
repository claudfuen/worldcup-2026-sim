import { cache } from "react";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, localeConfig, type Locale } from "./config";
import { formatMessage } from "./format-message";
import enMessages from "./messages/en.json";

// LOCALE_HEADER (defined in config.ts) is stamped onto every request by the proxy, so any server
// component can recover the locale WITHOUT prop-drilling a `lang` through the whole tree. Works because
// every page is force-dynamic (headers() is available per request).
export { LOCALE_HEADER };

type Messages = Record<string, unknown>;

/** The locale for the current request (header-derived), defaulting to English. */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const v = (await headers()).get(LOCALE_HEADER);
    if (isLocale(v)) return v;
  } catch {
    /* headers() unavailable in this context — fall back to default */
  }
  return DEFAULT_LOCALE;
});

async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === DEFAULT_LOCALE) return enMessages as Messages;
  try {
    const mod = await import(`./messages/${locale}.json`);
    return ((mod as { default?: Messages }).default ?? mod) as Messages;
  } catch {
    return enMessages as Messages; // catalog not present yet → English
  }
}

function lookup(messages: Messages, key: string): string | undefined {
  let cur: unknown = messages;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string;

/**
 * Request-scoped translator. `await getT()` in any server component, then `t("nav.bracket")` or
 * `t("groups.verdict", { settled, total })`. Per-key fallback: active locale → English → the key
 * itself, so a missing translation degrades gracefully rather than throwing.
 */
export const getT = cache(async (): Promise<TFunction> => {
  const locale = await getLocale();
  const intl = localeConfig(locale).intl;
  const messages = await loadMessages(locale);
  return (key, params) => {
    const template = lookup(messages, key) ?? lookup(enMessages as Messages, key) ?? key;
    return formatMessage(template, params, intl);
  };
});

/** Text direction for the current request — for `dir=` and conditional logical styling. */
export const getDir = cache(async (): Promise<"ltr" | "rtl"> => localeConfig(await getLocale()).dir);

/** The active locale's BCP-47 Intl tag, for ad-hoc Intl.* formatting in server components. */
export const getIntlLocale = cache(async (): Promise<string> => localeConfig(await getLocale()).intl);
