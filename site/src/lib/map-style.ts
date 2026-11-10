// The map's look (decision 0035): Protomaps' "light" basemap style (style
// code BSD-3-Clause, design CC0), drawn from our own street map file, with
// letters (Noto Sans, OFL-1.1, owner Q122) and road signs (MIT) from this
// site's /map/ folder. Every address here is on our own site; a build test
// checks that nothing points anywhere else (privacy condition 3).
//
// Dark mode (owner, 2026-11-10; pv-design): when the device is set to dark,
// the same street map file is drawn with Protomaps' "dark" colours from the
// same pinned package, with its label colours lightened to 4.5:1 or more on
// their halos. The road signs stay the "light" sprite already in /map/, so
// dark mode needs no new file and makes no new request.
//
// The pins are not part of this style's data: they are a separate layer
// from our own listings, never merged into the OpenStreetMap tiles
// (scraping-licence condition 5).
import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

/** The protocol name the map uses to read tiles from the street map pieces (see map-engine.ts). */
export const TILE_PROTOCOL = "pvtiles";

export interface StyleOptions {
  /** The page's language, for place names that OpenStreetMap has in that language. */
  lang: string;
  /** The site's address, such as https://example.org (MapLibre needs full addresses). */
  origin: string;
  /** The street map's highest zoom level, or null when this build has no street map. */
  maxzoom: number | null;
  /** Dark colours; left out, it follows the device's dark-mode setting. */
  dark?: boolean;
}

/** True when the device asks for dark mode (never in a build or a test without a window). */
export function prefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Protomaps' dark colours with the labels lightened: each is 4.5:1 or more on
 * its halo (#1f1f1f or #212121). See docs/design.md "Dark mode".
 */
export function darkFlavor(): Flavor {
  return {
    ...namedFlavor("dark"),
    roads_label_minor: "#949494", // 5.4:1
    roads_label_major: "#9a9a9a", // 5.9:1
    address_label: "#949494", // 5.4:1
    subplace_label: "#949494", // 5.4:1
    city_label: "#a3a3a3", // 6.5:1
    state_label: "#949494", // 5.4:1
    country_label: "#949494", // 5.4:1
    ocean_label: "#8f9fd0", // 6.3:1
  };
}

/** The style: street map (when there is one) under nothing else; pins are added by the map code. */
export function mapStyle({ lang, origin, maxzoom, dark = prefersDark() }: StyleOptions): StyleSpecification {
  const flavor = dark ? darkFlavor() : namedFlavor("light");
  if (maxzoom === null) {
    return {
      version: 8,
      sources: {},
      layers: [{ id: "background", type: "background", paint: { "background-color": flavor.earth } }],
    };
  }
  return {
    version: 8,
    glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/light`,
    sources: {
      protomaps: {
        type: "vector",
        tiles: [`${TILE_PROTOCOL}://basemap/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom,
      },
    },
    layers: layers("protomaps", flavor, { lang }) as StyleSpecification["layers"],
  };
}
