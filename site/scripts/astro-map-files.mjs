// Puts the map's own files into the built site (decision 0035; privacy
// condition 3, scraping-licence conditions 4 to 6). Used by astro.config.mjs.
//
// - MapLibre's worker script and stylesheet, copied from node_modules, so the
//   map code never loads anything from another site.
// - The street map, only when PV_BASEMAP names a basemap.json made by
//   scripts/cut-basemap.mjs. Each piece (PMTiles file) is checked against the
//   size and SHA-256 written there, so a half-copied or swapped file stops the
//   build. Then every tile in the pieces is written out as its own small file,
//   dist/map/tiles/<z>/<x>/<y>.mvt (gzip bytes), so the map needs no HTTP range
//   requests: the live host (Workers static assets) answers a range request
//   with the whole file (owner chose this fix, 2026-11-10). The pieces
//   themselves are copied too, only as whole-file downloads for the ODbL notice
//   on /map-data. All of it is OpenStreetMap data (ODbL): never kept in this
//   repo, only written into dist/ at build time.
//
// Without PV_BASEMAP the map still works, with pins on a plain background.
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { PMTiles } from "pmtiles";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const maplibreDir = resolve(here, "../node_modules/maplibre-gl");

const maplibreVersion = () => JSON.parse(readFileSync(join(maplibreDir, "package.json"), "utf8")).version;

/** The published name of MapLibre's worker, with the version so a new version is never served from an old cache. */
export function workerFileName() {
  return `maplibre-gl-worker-${maplibreVersion()}.mjs`;
}

/** MapLibre's stylesheet, loaded only when a map opens. */
export function cssFileName() {
  return `maplibre-gl-${maplibreVersion()}.css`;
}

/** Reads and checks the basemap description named by PV_BASEMAP_PATH, or returns null. */
export function readBasemap(path = process.env.PV_BASEMAP_PATH) {
  if (!path) return null;
  if (!existsSync(path)) throw new Error(`PV_BASEMAP names ${path}, which does not exist (make it with scripts/cut-basemap.mjs)`);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const folder = dirname(path);
  for (const part of manifest.parts ?? []) {
    const file = join(folder, part.file);
    if (!existsSync(file)) throw new Error(`basemap.json lists ${part.file}, which is not next to it in ${folder}`);
    const size = statSync(file).size;
    if (size !== part.bytes) throw new Error(`${part.file} is ${size} bytes, but basemap.json says ${part.bytes}: cut it again`);
  }
  return { manifest, folder };
}

/** A PMTiles source that reads a local file (no network, no range requests). */
class LocalFile {
  constructor(path) {
    this.path = path;
  }
  getKey() {
    return this.path;
  }
  async getBytes(offset, length) {
    const fd = openSync(this.path, "r");
    try {
      const buf = Buffer.alloc(length);
      const read = readSync(fd, buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + read) };
    } finally {
      closeSync(fd);
    }
  }
}

function openPieces(basemap) {
  return basemap.manifest.parts.map((p) => new PMTiles(new LocalFile(join(basemap.folder, p.file))));
}

/** Tile x and y at zoom z for a point (same as src/lib/map.ts tileXY). */
export function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const rad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Every tile position a piece covers, as the browser asks for them (src/lib/map.ts partFor). */
export function* pieceTiles(part) {
  const [w, s, e, n] = part.bbox;
  for (let z = part.minzoom; z <= part.maxzoom; z++) {
    const a = tileXY(w, n, z);
    const b = tileXY(e, s, z);
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) yield { z, x, y };
  }
}

/** One tile as gzip bytes, from the first piece that holds it (the browser's rule), or null. */
async function readTile(parts, archives, z, x, y) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (z < p.minzoom || z > p.maxzoom) continue;
    const a = tileXY(p.bbox[0], p.bbox[3], z);
    const b = tileXY(p.bbox[2], p.bbox[1], z);
    if (x < a.x || x > b.x || y < a.y || y > b.y) continue;
    const tile = await archives[i].getZxy(z, x, y);
    return tile ? gzipSync(Buffer.from(tile.data), { level: 9 }) : null;
  }
  return null;
}

/**
 * Writes every tile of the street map as <dir>/<z>/<x>/<y>.mvt (gzip bytes).
 * A tile on the edge of two pieces is written once, from the first piece,
 * as the browser would read it. Stops if any file would pass 25 MiB.
 */
export async function exportTiles(basemap, dir) {
  const archives = openPieces(basemap);
  const parts = basemap.manifest.parts;
  const seen = new Set();
  let files = 0;
  let bytes = 0;
  let largest = 0;
  for (const part of parts) {
    for (const { z, x, y } of pieceTiles(part)) {
      const key = `${z}/${x}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const data = await readTile(parts, archives, z, x, y);
      if (!data) continue;
      if (data.length > 25 * 1024 * 1024) throw new Error(`Tile ${key} is over 25 MiB`);
      mkdirSync(join(dir, String(z), String(x)), { recursive: true });
      writeFileSync(join(dir, String(z), String(x), `${y}.mvt`), data);
      files += 1;
      bytes += data.length;
      largest = Math.max(largest, data.length);
    }
  }
  return { files, bytes, largest };
}

function sha256(file) {
  return new Promise((ok, fail) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (d) => hash.update(d)).on("end", () => ok(hash.digest("hex"))).on("error", fail);
  });
}

export default function mapFiles() {
  return {
    name: "pv-map-files",
    hooks: {
      // While developing (npm run dev), serve the same files at the same addresses;
      // tiles are read from the pieces when asked for, not written out.
      "astro:server:setup": ({ server }) => {
        const worker = join(maplibreDir, "dist/maplibre-gl-worker.mjs");
        const basemap = readBasemap();
        const archives = basemap ? openPieces(basemap) : [];
        server.middlewares.use(async (req, res, next) => {
          const url = (req.url ?? "").split("?")[0];
          const tile = /^\/map\/tiles\/(\d+)\/(\d+)\/(\d+)\.mvt$/.exec(url);
          if (tile && basemap) {
            const bytes = await readTile(basemap.manifest.parts, archives, +tile[1], +tile[2], +tile[3]);
            if (!bytes) {
              res.statusCode = 404;
              return res.end();
            }
            res.setHeader("Content-Type", "application/octet-stream");
            return res.end(bytes);
          }
          let file = null;
          if (url === `/map/${workerFileName()}`) file = worker;
          else if (url === `/map/${cssFileName()}`) file = join(maplibreDir, "dist/maplibre-gl.css");
          else if (basemap && url.startsWith("/map/tiles/")) {
            const name = url.slice("/map/tiles/".length);
            if (basemap.manifest.parts.some((p) => p.file === name)) file = join(basemap.folder, name);
          }
          if (!file) return next();
          res.setHeader("Content-Type", file.endsWith(".mjs") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream");
          createReadStream(file).pipe(res);
        });
      },
      "astro:build:done": async ({ dir }) => {
        const out = fileURLToPath(dir);
        mkdirSync(join(out, "map"), { recursive: true });
        copyFileSync(join(maplibreDir, "dist/maplibre-gl-worker.mjs"), join(out, "map", workerFileName()));
        copyFileSync(join(maplibreDir, "dist/maplibre-gl.css"), join(out, "map", cssFileName()));
        const basemap = readBasemap();
        if (!basemap) return;
        mkdirSync(join(out, "map/tiles"), { recursive: true });
        for (const part of basemap.manifest.parts) {
          const from = join(basemap.folder, part.file);
          const digest = await sha256(from);
          if (digest !== part.sha256) throw new Error(`${part.file} does not match the SHA-256 in basemap.json: cut it again`);
          // Whole-file download for the ODbL notice on /map-data; the map itself never reads it.
          copyFileSync(from, join(out, "map/tiles", part.file));
        }
        const done = await exportTiles(basemap, join(out, "map/tiles"));
        console.log(`[pv-map-files] street map: ${done.files} tile files, ${(done.bytes / 1e6).toFixed(1)} MB, largest ${(done.largest / 1e3).toFixed(0)} KB`);
      },
    },
  };
}
