// Calendar site build settings (PROJECT.md sections 2 and 3).
//
// Build-time inputs, all optional:
//   PV_EVENTS      path to the events file   (default: ../docs/examples/events.sample.json)
//   PV_SETTINGS    path to the city settings (default: settings.example.json)
//   PV_OPPORTUNITIES path to the flexible opportunities file (decision 0018;
//                  default: ../docs/examples/opportunities.sample.json; none there: an empty page)
//   PV_SITE_URL    the site's public address, e.g. https://example.org (full links; link-preview picture)
//   PV_TEST_BUILD  1 for a test build: "Test version" line, noindex, robots.txt lets in only Facebook's preview bot
//   PV_STATS       path to the running totals file (the private repo's metrics/listings-ledger.json):
//                  the About page's "To date, the calendar has listed …" line. Not set: the line is left out.
//   PV_BASEMAP     path to basemap.json from scripts/cut-basemap.mjs: the street map under the
//                  map's pins (decision 0035). Not set: pins on a plain background.
// Relative paths are read from the folder you run the command in.
import { defineConfig, passthroughImageService } from "astro/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import mapFiles from "./scripts/astro-map-files.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const fromCwd = (p) => resolve(process.cwd(), p);

process.env.PV_EVENTS_PATH = process.env.PV_EVENTS
  ? fromCwd(process.env.PV_EVENTS)
  : resolve(here, "../docs/examples/events.sample.json");
// Flexible opportunities are optional. A path given here must exist; the
// default sample may be missing, which gives an empty Flexible page.
process.env.PV_OPPORTUNITIES_PATH = process.env.PV_OPPORTUNITIES
  ? fromCwd(process.env.PV_OPPORTUNITIES)
  : resolve(here, "../docs/examples/opportunities.sample.json");
process.env.PV_OPPORTUNITIES_REQUIRED = process.env.PV_OPPORTUNITIES ? "1" : "";
// The running totals are optional (owner, 2026-11-10). A path given here must exist.
process.env.PV_STATS_PATH = process.env.PV_STATS ? fromCwd(process.env.PV_STATS) : "";
// The street map is optional (decision 0035); without it the maps show pins on a plain background.
process.env.PV_BASEMAP_PATH = process.env.PV_BASEMAP ? fromCwd(process.env.PV_BASEMAP) : "";
process.env.PV_SETTINGS_PATH = process.env.PV_SETTINGS
  ? fromCwd(process.env.PV_SETTINGS)
  : resolve(here, "settings.example.json");

export default defineConfig({
  site: process.env.PV_SITE_URL || undefined,
  // Tests give each build its own cache folder (tests/build-helper.ts).
  ...(process.env.PV_CACHE_DIR ? { cacheDir: process.env.PV_CACHE_DIR } : {}),
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  // No image processing, so the LGPL image library is never needed (see vendor/no-sharp).
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
  // MapLibre's worker and the street map pieces, served from this site only (decision 0035).
  integrations: [mapFiles()],
  // CSS through PostCSS, not minified: Vite never calls lightningcss (MPL-2.0),
  // which is replaced by an empty stand-in (vendor/no-lightningcss). Changing
  // either setting makes the build stop with an error. tests/build-guards.test.ts checks both.
  vite: { css: { transformer: "postcss" }, build: { cssMinify: false } },
});
