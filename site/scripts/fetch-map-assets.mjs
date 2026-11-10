// Downloads the map's letters and road signs once, from one fixed commit of
// protomaps/basemaps-assets, into public/map/ (decision 0035; privacy
// condition 3: every map file comes from our own site).
//
//   Letters: Noto Sans Regular, Medium, Italic, as MapLibre glyph files (.pbf),
//            only the ranges that Latin-script names need (English, Spanish
//            and the other Latin-script names on a US map). SIL OFL-1.1,
//            allowed for fonts only (owner, Q122). The licence text is saved too.
//   Road signs and small map symbols: the "light" sprite, 1x and 2x. MIT,
//            from tangrams/icons (Mapzen); the licence text is saved too.
//
// About 2.1 MB in all. Nothing here is OpenStreetMap data, so it may live in
// this MIT repo (scraping-licence condition 5 is about the street map file).
//
// Run from site/:  node scripts/fetch-map-assets.mjs           (download and check, as CitywideVolunteersBot)
//                  node scripts/fetch-map-assets.mjs --check   (check the files already there)
// Each file's SHA-256 is pinned in scripts/map-assets.lock.json. The first
// run writes that file; later runs stop if any download differs from it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(site, "public/map");
const lockPath = join(site, "scripts/map-assets.lock.json");

/** protomaps/basemaps-assets, 2025-10-31 ("add more POI icons"). */
export const ASSETS_COMMIT = "028c18f713baecad011301ff7a69acc39bcc2ae7";
/** tangrams/icons, for the sprite's MIT licence text. */
export const ICONS_COMMIT = "92510779634f4a006c61ea70e50cb8c52c765a81";

export const FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
/** Basic Latin to Latin Extended-B, combining marks, Latin Extended Additional, punctuation, letterlike symbols. */
export const RANGES = ["0-255", "256-511", "512-767", "768-1023", "7680-7935", "8192-8447", "8448-8703"];
const SPRITES = ["light.json", "light.png", "light@2x.json", "light@2x.png"];

/** Every file: where it is saved (under public/map/) and where it comes from. */
export function assetList() {
  const raw = (repo, commit, path) => `https://raw.githubusercontent.com/${repo}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const list = [];
  for (const font of FONTS) {
    for (const range of RANGES) {
      list.push({ path: `fonts/${font}/${range}.pbf`, url: raw("protomaps/basemaps-assets", ASSETS_COMMIT, `fonts/${font}/${range}.pbf`) });
    }
  }
  list.push({ path: "fonts/OFL.txt", url: raw("protomaps/basemaps-assets", ASSETS_COMMIT, "fonts/OFL.txt") });
  for (const name of SPRITES) {
    list.push({ path: `sprites/${name}`, url: raw("protomaps/basemaps-assets", ASSETS_COMMIT, `sprites/v4/${name}`) });
  }
  list.push({ path: "sprites/LICENSE.md", url: raw("tangrams/icons", ICONS_COMMIT, "LICENSE.md") });
  return list;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function main() {
  const checkOnly = process.argv.includes("--check");
  // Our named bot, like the scrapers (pvscrapers/fetch.py); --contact you@example.org adds a contact address.
  const i = process.argv.indexOf("--contact");
  const agent = `CitywideVolunteersBot/map-assets${i > 0 && process.argv[i + 1] ? ` (+mailto:${process.argv[i + 1]})` : ""}`;
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
  const next = { assets_commit: ASSETS_COMMIT, icons_commit: ICONS_COMMIT, files: {} };
  let total = 0;
  for (const { path, url } of assetList()) {
    const file = join(out, path);
    let buf;
    if (checkOnly) {
      if (!existsSync(file)) throw new Error(`Missing: public/map/${path}. Run node scripts/fetch-map-assets.mjs`);
      buf = readFileSync(file);
    } else {
      const res = await fetch(url, { headers: { "User-Agent": agent } });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    const digest = sha256(buf);
    const pinned = lock?.files?.[path];
    if (pinned && pinned !== digest) throw new Error(`public/map/${path} does not match scripts/map-assets.lock.json; nothing was changed after this file`);
    next.files[path] = digest;
    total += buf.length;
    if (!checkOnly) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
    }
  }
  if (!lock && !checkOnly) writeFileSync(lockPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`${checkOnly ? "Checked" : "Saved"} ${Object.keys(next.files).length} map files in public/map/ (${(total / 1e6).toFixed(1)} MB).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
