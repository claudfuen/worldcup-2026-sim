import { Space_Grotesk, Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import "flag-icons/css/flag-icons.min.css"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { Nav } from "@/components/nav"
import { getPredictions } from "@/lib/getPredictions"
import { cn } from "@/lib/utils";
import type { Metadata, Viewport } from "next"

const SITE_NAME = "World Cup 2026 Predictions"
const SITE_URL = "https://worldcup2026predictions.app"
const TITLE = "World Cup 2026 Predictions — Live Odds, Bracket & Champion %"
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
    title: "World Cup 2026 Predictions — Live Odds & Bracket",
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
}: Readonly<{
  children: React.ReactNode
}>) {
  let updatedAt: string | null = null
  try {
    updatedAt = (await getPredictions()).updatedAt
  } catch {
    updatedAt = null
  }
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("dark scheme-only-dark antialiased", fontMono.variable, display.variable, "font-sans", inter.variable)}
    >
      <body className="bg-background text-foreground min-h-svh">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <ThemeProvider defaultTheme="dark" enableSystem={false}>
          <Nav updatedAt={updatedAt} />
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
