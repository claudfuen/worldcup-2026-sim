import type { MetadataRoute } from "next";

// PWA manifest — enables "Add to Home Screen" on Android + iOS. Icons come from app/icon.tsx +
// app/apple-icon.tsx (Next file conventions → next/og), referenced by their canonical URLs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "World Cup 2026 Predictions",
    short_name: "World Cup 26",
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
    icons: [
      { src: "/icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
