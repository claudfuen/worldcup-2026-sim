import { Space_Grotesk, Geist_Mono, Inter } from "next/font/google"

import "../globals.css"
import "flag-icons/css/flag-icons.min.css"
import { Analytics } from "@vercel/analytics/next"
import { GoogleAnalytics } from "@next/third-parties/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Nav } from "@/components/nav"
import { ScoreTicker } from "@/components/score-ticker"
import { AnalyticsListener } from "@/components/analytics-listener"
import { InstallPrompt } from "@/components/install-prompt"
import { ServiceWorkerRegister } from "@/components/sw-register"
import { getPredictions } from "@/lib/getPredictions"
import { getLiveMatches, overlayLive } from "@/lib/live"
import { cn } from "@/lib/utils";
import { localeConfig } from "@/lib/i18n/config"
import { getMessages } from "@/lib/i18n/server"
import { I18nProvider } from "@/lib/i18n/provider"
import type { MatchInfo } from "@/lib/predictions"
import type { Metadata, Viewport } from "next"

const SITE_NAME = "World Cup Predictor"
const SITE_URL = "https://worldcup2026predictions.app"
// Brand is "World Cup Predictor"; "2026 World Cup" stays in the title/keywords/description as SEO terms.
const TITLE = "World Cup Predictor — 2026 World Cup Odds, Bracket & Champion %"
const DESCRIPTION =
  "Monte Carlo predictions for the 2026 FIFA World Cup — group-winner odds, advancement, knockout-round and champion probabilities, updated live from real results."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: { default: TITLE, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "World Cup 2026 predictions",
    "World Cup 2026 odds",
    "who will win the World Cup 2026",
    "World Cup 2026 bracket",
    "World Cup 2026 simulator",
    "World Cup 2026 group predictions",
    "World Cup 2026 champion odds",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: TITLE,
    description:
      "Monte Carlo odds for every team: win your group, advance, reach each knockout round, and lift the trophy — updated live from real results.",
  },
  twitter: {
    card: "summary_large_image",
    title: "World Cup Predictor — 2026 Odds, Bracket & Champion %",
    description:
      "Monte Carlo odds for every team to advance, reach each round, and win the 2026 World Cup. Updated live.",
  },
}

export const viewport: Viewport = {
  themeColor: "#0f1512",
  colorScheme: "dark",
}

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: DESCRIPTION,
}

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ lang: string }>
}>) {
  const { lang } = await params
  // The proxy guarantees lang is a valid locale here; localeConfig falls back to the default otherwise.
  const cfg = localeConfig(lang)
  const messages = await getMessages()
  let updatedAt: string | null = null
  let tickerItems: MatchInfo[] = []
  try {
    const data = await getPredictions()
    updatedAt = data.updatedAt
    let matches = data.matches
    try {
      matches = overlayLive(data.matches, await getLiveMatches())
    } catch {
      // live feed unavailable — fall back to the cached payload's results
    }
    // Live (now) → upcoming confirmed fixtures (next, with kickoff time) → recent finals (past). Upcoming
    // is limited to matches with both teams known, so the ticker never shows a "TBD" knockout slot.
    const live = matches.filter((m) => m.status === "live")
    const upcoming = matches
      .filter((m) => m.status === "scheduled" && m.home && m.away)
      .sort((a, b) => a.utc.localeCompare(b.utc))
      .slice(0, 6)
    // The most recent finals regardless of age — always "the latest results", never an empty ticker on a
    // knockout rest day (chosen over a strict time window for exactly that reason).
    const finals = matches.filter((m) => m.status === "final").sort((a, b) => b.utc.localeCompare(a.utc)).slice(0, 10)
    tickerItems = [...live, ...upcoming, ...finals]
  } catch {
    updatedAt = null
  }
  return (
    <html
      lang={cfg.hreflang}
      dir={cfg.dir}
      suppressHydrationWarning
      className={cn("dark scheme-only-dark antialiased", fontMono.variable, display.variable, "font-sans", inter.variable)}
    >
      <body className="bg-background text-foreground min-h-svh">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <ThemeProvider defaultTheme="dark" enableSystem={false}>
          <I18nProvider messages={messages} intl={cfg.intl}>
            <AnalyticsListener />
            <Nav updatedAt={updatedAt} />
            <ScoreTicker items={tickerItems} />
            {children}
            <InstallPrompt />
          </I18nProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
        <Analytics />
      </body>
      <GoogleAnalytics gaId="G-8JXT39L2S9" />
    </html>
  )
}
