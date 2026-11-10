// Cuts the street map for the maps (decision 0035; scraping-licence
// conditions 4 to 6) from ONE dated Protomaps build, once. It is not part of
// the build and not run on every pipeline run: the pieces it makes are kept
// and reused until someone chooses to cut a newer build.
//
// What it does:
//   1. Checks that the build exists (build-metadata.protomaps.dev) and prints its size.
//   2. Plans pieces with `pmtiles extract --dry-run` (reads only the build's index,
//      a few MB), so that no piece is bigger than --limit-mib (Cloudflare Pages
//      serves files up to 25 MiB): one piece for the low zoom levels of the whole
//      region, then each higher zoom level split into areas until each fits.
//   3. Prints the plan and the total download. It downloads nothing more unless
//      you add --download.
//   4. With --download: cuts each piece, checks its size, and writes basemap.json
//      (build, date, region, commands, each piece's size and SHA-256) next to them.
//      The site's build reads that file through PV_BASEMAP.
//
// The pieces are OpenStreetMap data under the ODbL. They must never be put in
// this MIT repo (scraping-licence condition 5); --out must be outside it.
//
// Needs the `pmtiles` command (go-pmtiles, BSD-3-Clause): brew install pmtiles
// The build list is read as CitywideVolunteersBot (add --contact you@example.org to
// put a contact address in it). pmtiles itself has no setting for its User-Agent.
//
// Example (Greater Philadelphia):
//   node scripts/cut-basemap.mjs --build 20261109 --bbox=-76.15,39.45,-74.38,40.61 \
//     --maxzoom 14 --out /path/outside/this/repo/basemap
//   ...look at the plan and the size, then run it again with --download.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const BUILDS = "https://build-metadata.protomaps.dev/builds.json";
const buildUrl = (build) => `https://build.protomaps.com/${build}.pmtiles`;
const MIB = 1024 * 1024;

function args(argv) {
  const out = { download: false, limitMib: 25, maxzoom: 14 };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const value = () => inline ?? argv[++i];
    if (flag === "--build") out.build = value();
    else if (flag === "--bbox") out.bbox = value().split(",").map(Number);
    else if (flag === "--maxzoom") out.maxzoom = Number(value());
    else if (flag === "--out") out.out = resolve(value().replace(/^~(?=\/|$)/, homedir()));
    else if (flag === "--limit-mib") out.limitMib = Number(value());
    else if (flag === "--download") out.download = true;
    else if (flag === "--contact") out.contact = value();
    else throw new Error(`Unknown option ${flag}`);
  }
  if (!/^\d{8}$/.test(out.build ?? "")) throw new Error("--build YYYYMMDD is needed: one dated Protomaps build (see " + BUILDS + ")");
  if (!Array.isArray(out.bbox) || out.bbox.length !== 4 || out.bbox.some((n) => !Number.isFinite(n))) {
    throw new Error("--bbox=west,south,east,north is needed, in degrees");
  }
  const [w, s, e, n] = out.bbox;
  if (!(w < e && s < n)) throw new Error("--bbox must be west,south,east,north with west < east and south < north");
  if (!Number.isInteger(out.maxzoom) || out.maxzoom < 8 || out.maxzoom > 15) throw new Error("--maxzoom must be a whole number from 8 to 15");
  if (!out.out) throw new Error("--out FOLDER is needed, outside this repo");
  if (insideRepo(out.out)) {
    throw new Error(`--out ${out.out} is inside the public repo. The map pieces are ODbL data and must be kept elsewhere.`);
  }
  if (!(out.limitMib > 1)) throw new Error("--limit-mib must be more than 1");
  return out;
}

/** The real path of a folder, following links; for one that does not exist yet, its nearest existing parent's. */
function realFolder(path) {
  let p = resolve(path);
  const rest = [];
  while (!existsSync(p)) {
    rest.unshift(p.slice(dirname(p).length + 1));
    p = dirname(p);
  }
  return join(realpathSync(p), ...rest);
}

/** True when `path` is this repo or inside it, links followed ("..x" names are inside, not outside). */
export function insideRepo(path) {
  const rel = relative(realpathSync(repo), realFolder(path));
  return rel === "" || !(rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel));
}

/** Runs pmtiles and returns everything it printed (it logs to stderr). */
function pmtiles(list) {
  const run = spawnSync("pmtiles", list, { encoding: "utf8" });
  if (run.error?.code === "ENOENT") throw new Error("The pmtiles command is not installed. Install it with: brew install pmtiles");
  if (run.error || run.status !== 0) throw new Error(`pmtiles ${list.join(" ")} failed:\n${run.stderr || run.error?.message}`);
  return `${run.stdout}\n${run.stderr}`;
}

/** The command line for one piece, as published with the ODbL notice. */
function extractArgs(build, file, piece) {
  return [
    "extract",
    buildUrl(build),
    file,
    `--bbox=${piece.bbox.join(",")}`,
    `--minzoom=${piece.minzoom}`,
    `--maxzoom=${piece.maxzoom}`,
  ];
}

const UNITS = { B: 1, kB: 1e3, KB: 1e3, MB: 1e6, GB: 1e9, KiB: 1024, MiB: MIB, GiB: 1024 * MIB };

/** Estimated size of one piece in bytes, from a dry run (reads only the build's index). */
function estimate(build, piece) {
  const log = pmtiles([...extractArgs(build, "/dev/null", piece), "--dry-run"]);
  const m = /archive size of ([\d.]+) ?([kKMG]i?B|B)/.exec(log);
  if (m) return Number(m[1]) * UNITS[m[2]];
  throw new Error(`Could not read the size from pmtiles' dry run:\n${log}`);
}

/** Splits a box in two across its longer side. */
function halves([w, s, e, n]) {
  if (e - w >= n - s) {
    const mid = (w + e) / 2;
    return [[w, s, mid, n], [mid, s, e, n]];
  }
  const mid = (s + n) / 2;
  return [[w, s, e, mid], [w, mid, e, n]];
}

/** Pieces, each under the limit (with a 5% margin, as dry-run sizes are rounded). */
function plan(build, bbox, maxzoom, limit) {
  const room = limit * 0.95;
  const pieces = [];
  // Low zoom levels of the whole region in one piece: as many as fit.
  let low = maxzoom;
  for (; low >= 0; low--) {
    const size = estimate(build, { bbox, minzoom: 0, maxzoom: low });
    if (size <= room) {
      pieces.push({ bbox, minzoom: 0, maxzoom: low, estimate: size });
      break;
    }
  }
  if (low < 0) throw new Error("Even zoom 0 does not fit the limit; check --bbox");
  // Each higher zoom level on its own, split into areas until each fits.
  for (let z = low + 1; z <= maxzoom; z++) {
    const queue = [bbox];
    let guard = 0;
    while (queue.length) {
      if (++guard > 256) throw new Error(`Zoom ${z} needs too many pieces; use a lower --maxzoom or a smaller --bbox`);
      const box = queue.shift();
      const size = estimate(build, { bbox: box, minzoom: z, maxzoom: z });
      if (size <= room) {
        if (size > 0) pieces.push({ bbox: box.map((v) => Math.round(v * 1e6) / 1e6), minzoom: z, maxzoom: z, estimate: size });
      } else queue.push(...halves(box));
    }
  }
  return pieces;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function main() {
  const opt = args(process.argv.slice(2));
  const limit = opt.limitMib * MIB;

  const agent = `CitywideVolunteersBot/map-cut${opt.contact ? ` (+mailto:${opt.contact})` : ""}`;
  const res = await fetch(BUILDS, { headers: { "User-Agent": agent } });
  if (!res.ok) throw new Error(`${BUILDS}: HTTP ${res.status}`);
  const builds = await res.json();
  const entry = builds.find((b) => b.key === `${opt.build}.pmtiles`);
  if (!entry) throw new Error(`Build ${opt.build} is not in ${BUILDS}. Recent builds: ${builds.slice(-5).map((b) => b.key).join(", ")}`);
  console.log(`Build ${entry.key}, data version ${entry.version}, whole planet ${(entry.size / 2 ** 30).toFixed(1)} GiB (only the region below is read).`);

  console.log(`Planning pieces of at most ${opt.limitMib} MiB for ${opt.bbox.join(",")} up to zoom ${opt.maxzoom} (dry runs: index only)...`);
  const pieces = plan(opt.build, opt.bbox, opt.maxzoom, limit);
  const total = pieces.reduce((n, p) => n + p.estimate, 0);
  pieces.forEach((p, i) => {
    console.log(`  piece ${i}: zoom ${p.minzoom}-${p.maxzoom}, ${p.bbox.join(",")}, about ${(p.estimate / 1e6).toFixed(0)} MB`);
  });
  console.log(`${pieces.length} pieces, about ${(total / 1e6).toFixed(0)} MB to download in all.`);
  if (!opt.download) {
    console.log("Nothing downloaded. To cut these pieces, run the same command again with --download.");
    return;
  }

  mkdirSync(opt.out, { recursive: true });
  const commands = [];
  const parts = [];
  for (const [i, p] of pieces.entries()) {
    const name = `basemap-${opt.build}-${i}.pmtiles`;
    const file = join(opt.out, name);
    const cmd = extractArgs(opt.build, name, p);
    commands.push(`pmtiles ${cmd.join(" ")}`);
    console.log(`Cutting ${name}...`);
    pmtiles([...extractArgs(opt.build, file, p), "--quiet"]);
    const bytes = statSync(file).size;
    if (bytes > limit) throw new Error(`${name} is ${(bytes / MIB).toFixed(1)} MiB, over the ${opt.limitMib} MiB limit. Lower --maxzoom or cut again.`);
    parts.push({ file: name, minzoom: p.minzoom, maxzoom: p.maxzoom, bbox: p.bbox, bytes, sha256: sha256(file) });
  }
  const manifest = {
    build: opt.build,
    version: entry.version ?? "",
    source: buildUrl(opt.build),
    cut_on: new Date().toISOString().slice(0, 10),
    bbox: opt.bbox,
    maxzoom: opt.maxzoom,
    commands,
    parts,
  };
  const manifestPath = join(opt.out, "basemap.json");
  if (existsSync(manifestPath)) console.log(`Replacing ${manifestPath} (the old pieces stay until you remove them).`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const sum = parts.reduce((n, p) => n + p.bytes, 0);
  console.log(`Done: ${parts.length} pieces, ${(sum / MIB).toFixed(1)} MiB, and ${manifestPath}.`);
  console.log(`Build the site with PV_BASEMAP=${manifestPath}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
