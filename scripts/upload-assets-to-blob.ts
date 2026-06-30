// Download the assets we currently hotlink (Wikimedia stadium photos; later TheSportsDB headshots) and
// re-host them on Vercel Blob, so the app serves its own copies — no third-party CDN dependency at runtime.
// Re-runnable: uploads with stable pathnames (no random suffix) and rewrites the vendored data files in place.
//
//   bun run scripts/upload-assets-to-blob.ts venues     # stadium photos -> Blob, rewrite venuePhotos.ts
//   bun run scripts/upload-assets-to-blob.ts players    # headshots -> Blob, rewrite playerImages.ts (needs sources)
import { put } from "@vercel/blob";
import { writeFileSync } from "node:fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string): Promise<{ buf: Buffer; ct: string } | null> {
  for (let a = 0; a < 7; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "WC2026Predictions/1.0 (asset mirror)" } });
      if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), ct: r.headers.get("content-type") || "image/jpeg" };
      if (r.status === 429 || r.status >= 500) { await sleep(4000 * (a + 1)); continue; }
      return null;
    } catch {
      await sleep(3000);
    }
  }
  return null;
}

async function upload(pathname: string, buf: Buffer, ct: string): Promise<string> {
  const blob = await put(pathname, buf, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: ct });
  return blob.url;
}

async function venues() {
  const { VENUE_PHOTOS } = (await import("@/lib/data/venuePhotos")) as { VENUE_PHOTOS: Record<string, { url: string; cardUrl?: string; artist: string; license: string; licenseUrl: string; source: string }> };
  const out: Record<string, { url: string; cardUrl: string; artist: string; license: string; licenseUrl: string; source: string }> = {};
  for (const [slug, p] of Object.entries(VENUE_PHOTOS)) {
    const meta = { artist: p.artist, license: p.license, licenseUrl: p.licenseUrl, source: p.source };
    // Already on Blob? keep it.
    if (p.url.includes("blob.vercel-storage.com")) { out[slug] = { url: p.url, cardUrl: p.cardUrl ?? p.url, ...meta }; continue; }
    const hero = await download(p.url);
    const card = await download(p.url.replace("/1280px-", "/500px-"));
    if (!hero) {
      // Never drop a venue — keep its current (source) URL so it still renders; a re-run will convert it.
      out[slug] = { url: p.url, cardUrl: p.cardUrl ?? p.url, ...meta };
      console.log(`  ${slug}: re-host failed — kept source URL (retry later)`);
      continue;
    }
    const ext = hero.ct.includes("png") ? "png" : "jpg";
    const heroUrl = await upload(`venues/${slug}.${ext}`, hero.buf, hero.ct);
    const cardUrl = card ? await upload(`venues/${slug}-card.${ext}`, card.buf, card.ct) : heroUrl;
    out[slug] = { url: heroUrl, cardUrl, ...meta };
    console.log(`  ${slug}: ok`);
    await sleep(400);
  }
  const hdr =
    "// AUTO-GENERATED. Stadium photos re-hosted on Vercel Blob from Wikimedia Commons originals. Attribution\n" +
    "// (artist/license/source) is preserved from the source and MUST stay displayed. `url` = full, `cardUrl` =\n" +
    "// smaller grid thumbnail. Re-run scripts/upload-assets-to-blob.ts venues to refresh.\n" +
    "export interface VenuePhoto { slug: string; url: string; cardUrl: string; artist: string; license: string; licenseUrl: string; source: string }\n\n" +
    "export const VENUE_PHOTOS: Record<string, VenuePhoto> = ";
  const withSlug = Object.fromEntries(Object.entries(out).map(([s, v]) => [s, { slug: s, ...v }]));
  writeFileSync("lib/data/venuePhotos.ts", hdr + JSON.stringify(withSlug, null, 0) + ";\n");
  console.log(`\nvenues done: ${Object.keys(out).length} uploaded`);
}

async function players() {
  // Source map (teamCode|name -> TheSportsDB URL or "") produced by scripts/fetch-player-images.ts.
  const srcMod = await import("@/lib/data/playerImages");
  const src = (srcMod as { PLAYER_IMAGES: Record<string, string> }).PLAYER_IMAGES;
  const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const out: Record<string, string> = {};
  let done = 0;
  for (const [key, url] of Object.entries(src)) {
    if (!url) { out[key] = ""; continue; }
    if (!url.startsWith("http")) { out[key] = url; continue; } // already a Blob url
    const [code, name] = key.split("|");
    const img = await download(url);
    if (!img) { console.log(`  ${key}: download failed`); continue; }
    out[key] = await upload(`players/${code.toLowerCase()}-${slugify(name)}.png`, img.buf, img.ct);
    if (++done % 25 === 0) console.log(`  ...${done} uploaded`);
    await sleep(120);
  }
  const hdr =
    "// AUTO-GENERATED. Player headshots re-hosted on Vercel Blob from TheSportsDB cutouts. Keyed by\n" +
    '// "teamCode|playerName"; "" = no photo. Re-run scripts/upload-assets-to-blob.ts players to refresh.\n' +
    "export const PLAYER_IMAGES: Record<string, string> = ";
  writeFileSync("lib/data/playerImages.ts", hdr + JSON.stringify(out, null, 0) + ";\n");
  console.log(`\nplayers done: ${Object.values(out).filter(Boolean).length} uploaded`);
}

const which = process.argv[2];
if (which === "venues") await venues();
else if (which === "players") await players();
else console.log("usage: bun run scripts/upload-assets-to-blob.ts <venues|players>");
