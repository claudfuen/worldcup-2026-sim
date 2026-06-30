// Download the assets we currently hotlink (Wikimedia stadium photos; later TheSportsDB headshots) and
// re-host them on Vercel Blob, so the app serves its own copies — no third-party CDN dependency at runtime.
// Re-runnable: uploads with stable pathnames (no random suffix) and rewrites the vendored data files in place.
//
//   bun run scripts/upload-assets-to-blob.ts venues     # stadium photos -> Blob, rewrite venuePhotos.ts
//   bun run scripts/upload-assets-to-blob.ts players    # headshots -> Blob, rewrite playerImages.ts (needs sources)
import { put } from "@vercel/blob";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

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

// Parse a vendored `Record<string,string>` data file by reading the file (NOT importing it) so we get a fresh
// snapshot each run — the source map may still be growing under a running resolver, and the import cache would
// pin a stale copy.
function parseMap(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const m = readFileSync(path, "utf8").match(/\{[\s\S]*\}/);
  try {
    return m ? (JSON.parse(m[0]) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function players() {
  // SRC = resolver output (teamCode|name -> TheSportsDB URL or ""), which may still be growing. We never write
  // SRC (so we don't clobber the resolver) — we mirror its images to Blob and write a SEPARATE map (OUT) that
  // getPlayerImage reads. Resumable + safe to run mid-resolve: re-run after the resolver finishes to add the rest.
  const SRC = "lib/data/playerImages.ts";
  const OUT = "lib/data/playerImagesBlob.ts";
  const src = parseMap(SRC);
  const out = parseMap(OUT); // resume: keep everything already mirrored
  const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const writeOut = () => {
    const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
    const hdr =
      "// AUTO-GENERATED by `scripts/upload-assets-to-blob.ts players` — player headshots re-hosted on Vercel Blob,\n" +
      '// keyed by "teamCode|playerName". "" = confirmed no photo. getPlayerImage() reads this map first (self-hosted,\n' +
      "// no API call); a key that's absent falls back to a live TheSportsDB lookup. Re-run the script to extend.\n" +
      "export const PLAYER_IMAGES_BLOB: Record<string, string> = ";
    writeFileSync(OUT, hdr + JSON.stringify(sorted, null, 0) + ";\n");
  };
  const entries = Object.entries(src);
  let scanned = 0, uploaded = 0;
  for (const [key, url] of entries) {
    scanned++;
    if (key in out) continue; // already mirrored on a previous run
    if (!url) { out[key] = ""; continue; } // confirmed no photo — record so getPlayerImage short-circuits
    if (!url.startsWith("http")) { out[key] = url; continue; } // already a Blob url
    const [code, name] = key.split("|");
    const img = await download(url);
    if (!img) { console.log(`  ${key}: download failed (will retry next run)`); continue; } // not recorded → retried
    out[key] = await upload(`players/${code.toLowerCase()}-${slugify(name)}.png`, img.buf, img.ct);
    if (++uploaded % 25 === 0) { writeOut(); console.log(`  ...${uploaded} uploaded (${scanned}/${entries.length} scanned)`); }
    await sleep(120);
  }
  writeOut();
  console.log(`\nplayers done: ${Object.values(out).filter(Boolean).length} on Blob, ${Object.values(out).filter((v) => v === "").length} no-photo, of ${entries.length} resolved`);
}

const which = process.argv[2];
if (which === "venues") await venues();
else if (which === "players") await players();
else console.log("usage: bun run scripts/upload-assets-to-blob.ts <venues|players>");
