import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isActiveLocale, LOCALE_HEADER } from "@/lib/i18n/config";

// Next 16 renamed the `middleware` convention to `proxy`. This is our locale router.
//
// Strategy — English at the root, every other locale prefixed:
//   /bracket        → rewrite to /en/bracket  (clean URL preserved; default locale, no visible prefix)
//   /es/bracket     → pass through            (active non-default locale)
//   /en/bracket     → redirect to /bracket    (strip redundant default prefix → one canonical URL)
//   /xx/… (inactive)→ treated as English content (rewritten to /en/xx/… → 404 if no such page)
//
// Either way we stamp x-locale so server components can read the locale via getLocale() without
// threading a `lang` prop everywhere.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSeg = pathname.split("/")[1];

  // /en/… is the same content as the prefix-less root — permanent-redirect to the canonical URL so
  // crawlers consolidate ranking signals onto the unprefixed path.
  if (firstSeg === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  // A launched non-default locale → serve as-is, just record the locale.
  if (isActiveLocale(firstSeg)) {
    const res = NextResponse.next();
    res.headers.set(LOCALE_HEADER, firstSeg);
    return res;
  }

  // Otherwise it's default-locale (English) content with no prefix → rewrite into the [lang] tree
  // without changing the visible URL.
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  const res = NextResponse.rewrite(url);
  res.headers.set(LOCALE_HEADER, DEFAULT_LOCALE);
  return res;
}

export const config = {
  // Run on page paths only. Skip: API routes, Next internals, the root-level metadata routes that have
  // no extension (icon, apple-icon), and any single-segment file (sw.js, favicon.ico, sitemap.xml,
  // robots.txt, manifest.webmanifest, *.png, …). Pages have no dot, so they're always handled.
  matcher: ["/((?!api|_next|icon|apple-icon|[^/]+\\.[^/]+$).*)"],
};
