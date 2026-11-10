// Build-time parts of the maps (decision 0035): the data each list card
// carries for the map, and the map's settings for the page.
//
// All pins come in the page itself, on the list cards (privacy condition 4;
// sensitive-events condition 1): no file per day, per filter or per listing,
// so opening or tapping a pin asks the server for nothing.
import maplibrePackage from "maplibre-gl/package.json" with { type: "json" };
import type { Translator } from "../i18n/index.ts";
import type { Opportunity, PreparedListing, SiteSettings } from "./types.ts";
import { mapPoint, type BasemapManifest } from "./map.ts";
import { placeSpoken, placeText } from "./words.ts";
import { listingText } from "../i18n/listing-text.ts";

/**
 * The data attributes one list card carries for the map. Empty when the
 * listing has no map point: it stays in the list and the map counts it as
 * "no map location". The same attributes for every listing, sensitive or
 * not (sensitive-events condition 4).
 */
export function mapAttrs(
  tr: Translator,
  item: PreparedListing | Opportunity,
  settings: Pick<SiteSettings, "sections">,
  opts: { href: string; when?: string },
): Record<string, string> {
  const point = mapPoint(item);
  if (!point) return {};
  // The same title the card shows: the machine translation on a page in another
  // language when there is one (decision 0036), else the organization's own words.
  const title = listingText(item, "title", tr.lang);
  const attrs: Record<string, string> = {
    "data-lat": String(point.lat),
    "data-lon": String(point.lon),
    "data-map-title": title?.text ?? item.title,
    "data-map-lang": title?.lang ?? item.listing_language,
    "data-map-place": placeSpoken(tr, item, settings) || placeText(tr, item, settings),
    "data-map-href": opts.href,
  };
  if (point.approximate) attrs["data-approx"] = "true";
  // Directions use the address the organization published; an approximate area has none to give.
  else if (item.address?.trim()) attrs["data-map-address"] = item.address.trim();
  if (opts.when) attrs["data-map-when"] = opts.when;
  // A machine-translated title says so in the map's details too (decision 0036; accessibility gate).
  if (title?.translated) attrs["data-map-translated"] = "true";
  return attrs;
}

/** MapLibre's version, for the worker's published file name (scripts/astro-map-files.mjs copies it). */
export function maplibreVersion(): string {
  return maplibrePackage.version;
}

/** The map's settings for the browser: where its files are, all on this site. */
export interface MapConfig {
  mode: "day" | "all";
  kind: "dated" | "flexible" | "teams";
  timezone: string;
  /** MapLibre's worker script, on this site. */
  worker: string;
  /** MapLibre's stylesheet, on this site, added only when the map opens. */
  css: string;
  /** The street map pieces, or null when this build has none. */
  basemap: null | {
    maxzoom: number;
    bbox: [number, number, number, number];
    parts: Array<{ url: string; minzoom: number; maxzoom: number; bbox: [number, number, number, number] }>;
  };
}

export function mapConfig(
  mode: MapConfig["mode"],
  kind: MapConfig["kind"],
  settings: SiteSettings,
  basemap: BasemapManifest | null,
): MapConfig {
  return {
    mode,
    kind,
    timezone: settings.site.timezone,
    worker: `/map/maplibre-gl-worker-${maplibreVersion()}.mjs`,
    css: `/map/maplibre-gl-${maplibreVersion()}.css`,
    basemap: basemap
      ? {
          maxzoom: basemap.maxzoom,
          bbox: basemap.bbox,
          parts: basemap.parts.map((p) => ({ url: `/map/tiles/${p.file}`, minzoom: p.minzoom, maxzoom: p.maxzoom, bbox: p.bbox })),
        }
      : null,
  };
}
