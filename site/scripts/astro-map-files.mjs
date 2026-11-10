// Puts the map's own files into the built site (decision 0035; privacy
// condition 3, scraping-licence conditions 4 to 6). Used by astro.config.mjs.
//
// - MapLibre's worker script and stylesheet, copied from node_modules, so the
//   map code never loads anything from another site.
// - The street map pieces (PMTiles files) and their description
//   (basemap.json), only when PV_BASEMAP names a basemap.json made by
//   scripts/cut-basemap.mjs. Each piece is checked against the size and
//   SHA-256 written there, so a half-copied or swapped file stops the build.
//   The pieces hold OpenStreetMap data (ODbL): they are never kept in this
//   repo, only copied into dist/ at build time.
//
// Without PV_BASEMAP the map still works, with pins on a plain background.
import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
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
      // While developing (npm run dev), serve the same files at the same addresses.
      "astro:server:setup": ({ server }) => {
        const worker = join(maplibreDir, "dist/maplibre-gl-worker.mjs");
        const basemap = readBasemap();
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? "").split("?")[0];
          let file = null;
          if (url === `/map/${workerFileName()}`) file = worker;
          else if (url === `/map/${cssFileName()}`) file = join(maplibreDir, "dist/maplibre-gl.css");
          else if (basemap && url.startsWith("/map/tiles/")) {
            const name = url.slice("/map/tiles/".length);
            if (basemap.manifest.parts.some((p) => p.file === name)) file = join(basemap.folder, name);
          }
          if (!file) return next();
          res.setHeader("Content-Type", file.endsWith(".mjs") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream");
          // The map reads the street map in pieces (HTTP range requests), as a static host serves them.
          const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ""));
          if (range) {
            const size = statSync(file).size;
            const start = Number(range[1]);
            const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
            res.statusCode = 206;
            res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
            res.setHeader("Content-Length", String(end - start + 1));
            createReadStream(file, { start, end }).pipe(res);
            return;
          }
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
          copyFileSync(from, join(out, "map/tiles", part.file));
        }
      },
    },
  };
}
