import type { MetadataRoute } from "next";

// PWA manifest — enables "Add to Home Screen" on Android + iOS. Icons come from app/icon.tsx +
// app/apple-icon.tsx (Next file conventions → next/og), referenced by their canonical URLs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "World Cup Predictor",
    short_name: "WC Predictor",
    description:
      "Live Monte Carlo odds, bracket and champion probabilities for the 2026 FIFA World Cup — updated from real results.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1512",
    theme_color: "#0f1512",
    scope: "/",
    lang: "en",
    orientation: "portrait",
    categories: ["sports"],
    // Lets getInstalledRelatedApps() report THIS PWA as installed, so we can stop prompting a user who
    // already added it even when they're browsing in a normal tab (not the standalone app).
    prefer_related_applications: false,
    related_applications: [
      { platform: "webapp", url: "https://worldcup2026predictions.app/manifest.webmanifest" },
    ],
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
