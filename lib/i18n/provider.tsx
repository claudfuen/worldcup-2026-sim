"use client";

import { createContext, useContext, useMemo } from "react";
import { formatMessage, lookupMessage } from "./format-message";

// Client-side counterpart to the server getT(). The layout (a server component) reads the active
// locale's full message object via getMessages() and hands it to this provider, so any CLIENT component
// can translate with the SAME catalog + ICU formatter — no per-component label props, no second catalog
// fetch. Server components keep using `await getT()` directly.

type Ctx = { messages: unknown; intl: string };
const I18nContext = createContext<Ctx>({ messages: {}, intl: "en-US" });

export function I18nProvider({
  messages,
  intl,
  children,
}: {
  messages: unknown;
  intl: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ messages, intl }), [messages, intl]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export type TFunction = (key: string, params?: Record<string, string | number | null | undefined>) => string;

/** `const t = useT()` in any client component; `t("nav.bracket")` / `t("freshness.minsAgo", { n })`. */
export function useT(): TFunction {
  const { messages, intl } = useContext(I18nContext);
  return useMemo(
    (): TFunction => (key, params) => formatMessage(lookupMessage(messages, key) ?? key, params, intl),
    [messages, intl],
  );
}
