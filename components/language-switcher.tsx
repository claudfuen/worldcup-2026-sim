"use client";

import Link from "next/link";
import { ACTIVE_LOCALES, localeHref } from "@/lib/i18n/config";
import { useLocaleAndPath } from "@/lib/i18n/client";
import { useT } from "@/lib/i18n/provider";

// Locale switcher. Each link points to the SAME page in another language (current path, re-prefixed),
// so a visitor keeps their place when switching. Returns null until more than one locale is launched.
// `variant`: "footer" = labelled wrap of pills; "inline" = bare wrap (e.g. a menu section).
export function LanguageSwitcher({ variant = "footer", className = "" }: { variant?: "footer" | "inline"; className?: string }) {
  const [current, path] = useLocaleAndPath();
  const t = useT();
  if (ACTIVE_LOCALES.length <= 1) return null;

  // Mobile-first: comfortable ~40px tap targets that wrap cleanly; compacted from sm: up.
  const links = (
    <ul className="flex flex-wrap gap-2 sm:gap-x-2 sm:gap-y-1.5">
      {ACTIVE_LOCALES.map((l) => {
        const active = l.id === current;
        return (
          <li key={l.id}>
            <Link
              href={localeHref(l.id, path)}
              hrefLang={l.hreflang}
              lang={l.hreflang}
              dir={l.dir}
              aria-current={active ? "true" : undefined}
              data-evt="language_switch"
              data-locale={l.id}
              className={
                "inline-flex items-center rounded-full border px-3.5 py-2 text-sm sm:px-2.5 sm:py-1 sm:text-xs " +
                (active
                  ? "text-foreground border-border bg-muted/40 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:border-border/70 border-border/40")
              }
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  if (variant === "inline") return <div className={className}>{links}</div>;

  return (
    <nav aria-label={t("nav.language")} className={className}>
      <h2 className="text-muted-foreground mb-2 font-mono text-xs font-semibold tracking-wide uppercase">
        {t("footer.switchLanguage")}
      </h2>
      {links}
    </nav>
  );
}
