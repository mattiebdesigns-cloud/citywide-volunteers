// The map itself (decision 0035), loaded only when the person first chooses
// "Map" (scripts/map-view.ts), so the list loads as fast as before.
//
// MapLibre GL JS (BSD-3-Clause; never Mapbox GL) draws the street map from
// our own PMTiles pieces, read in byte ranges from this site: no tile
// position is in any web address (privacy condition 1). The worker, letters
// and road signs are on this site too (privacy condition 3).
//
// Pins, places and number circles are real <button>s on top of the map, so
// they work by keyboard, have names, and sit in the Tab order from top to
// bottom and left to right. Nothing here records anything: no requests about
// a listing, no storage, nothing in the address, no analytics.
import { LngLatBounds, Map as MapLibre, Marker, addProtocol, setWorkerUrl } from "maplibre-gl";
// MapLibre's stylesheet is not imported here (that would put it on every page); map-view.ts
// adds it from /map/ just before this file loads.
import { PMTiles } from "pmtiles";
import { groupByPlace, groupOnScreen, isOnScreen, partFor, type Place, type PinItem } from "../lib/map.ts";
import { TILE_PROTOCOL, mapStyle } from "../lib/map-style.ts";
import type { MapConfig } from "../lib/map-build.ts";

/** "Near me" centers here: a neighborhood, never street level (privacy condition 1; checklist line Q117). */
export const NEAR_ME_ZOOM = 13;
/** Fitting the pins never zooms closer than this; the person can zoom in further. */
const FIT_MAX_ZOOM = 15;
/** From this zoom on there are no number circles; by then pins at different addresses stand apart. */
const CLUSTER_MAX_ZOOM = 16;
/** Places closer than this on screen (pixels) share a number circle: about one pin's width. */
const CLUSTER_RADIUS = 44;
const MAX_ZOOM = 18;

export interface EngineItem extends PinItem {
  li: HTMLElement;
}

export interface EngineHooks {
  /** A place's name for its pin, from the translation files. */
  placeName(place: Place<EngineItem>): Array<{ text: string; lang?: string }>;
  /** A number circle's name: "{count} shifts here; zoom in to see them". */
  clusterName(count: number): string;
  /** The person opened a pin. */
  onOpen(place: Place<EngineItem>, button: HTMLButtonElement): void;
  /** The map could not start (no WebGL, for example). */
  onFail(): void;
}

export interface Engine {
  update(items: EngineItem[], refit: boolean): void;
  zoomBy(step: 1 | -1): void;
  centerOn(lon: number, lat: number): void;
  focusCanvas(): void;
}

let protocolAdded = false;

/** Reads tiles z/x/y from whichever street map piece holds them. */
function addTileProtocol(parts: NonNullable<MapConfig["basemap"]>["parts"]): void {
  if (protocolAdded) return;
  protocolAdded = true;
  const files = parts.map((p) => new PMTiles(new URL(p.url, location.origin).href));
  addProtocol(TILE_PROTOCOL, async (params, abort) => {
    const m = /\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if (!m) throw new Error("bad tile address");
    const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const i = partFor(parts, z, x, y);
    if (i < 0) return { data: new Uint8Array() }; // outside the region: an empty tile
    const tile = await files[i].getZxy(z, x, y, abort.signal);
    return { data: tile ? new Uint8Array(tile.data) : new Uint8Array() };
  });
}

export function createEngine(canvas: HTMLElement, config: MapConfig, lang: string, locale: Record<string, string>, hooks: EngineHooks): Engine | null {
  setWorkerUrl(new URL(config.worker, location.origin).href);
  if (config.basemap) addTileProtocol(config.basemap.parts);

  let map: MapLibre;
  try {
    map = new MapLibre({
      container: canvas,
      style: mapStyle({ lang, origin: location.origin, maxzoom: config.basemap?.maxzoom ?? null }),
      bounds: config.basemap?.bbox,
      maxZoom: MAX_ZOOM,
      attributionControl: false, // our own credit, from the translation files, sits under the map
      cooperativeGestures: true, // one finger scrolls the page; two fingers move the map
      locale,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      hash: false, // never put the map's position in the address
      fadeDuration: 0,
    });
  } catch {
    hooks.onFail();
    return null;
  }
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  // Every move is instant: no fly-to animation (reduced motion, accessibility condition 9).
  const still = { animate: false } as const;

  let places = new Map<string, Place<EngineItem>>();
  const markers = new Map<string, { marker: Marker; button: HTMLButtonElement }>();
  let ready = false;
  let pending: { items: EngineItem[]; refit: boolean } | null = null;

  map.on("error", (e) => {
    // A missing tile or letter file is not worth stopping for; a lost drawing context is.
    if (String(e.error?.message ?? "").includes("WebGL")) hooks.onFail();
  });

  map.on("load", () => {
    ready = true;
    if (pending) {
      const p = pending;
      pending = null;
      update(p.items, p.refit);
    }
  });

  map.on("moveend", () => drawButtons());

  function pinButton(className: string, label: Array<{ text: string; lang?: string }>, shapeText: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    const name = document.createElement("span");
    name.className = "sr-only";
    for (const part of label) {
      const span = document.createElement("span");
      span.textContent = part.text;
      if (part.lang) span.lang = part.lang;
      name.append(span);
    }
    const shape = document.createElement("span");
    shape.className = "pv-pin__shape";
    shape.setAttribute("aria-hidden", "true");
    shape.textContent = shapeText;
    button.append(name, shape);
    return button;
  }

  /**
   * Builds the buttons for what the map shows now: one per place, and one
   * number circle where places crowd together on screen. Worked out from the
   * places themselves each time the map stops moving, so nothing old stays behind.
   */
  function drawButtons(): void {
    if (!ready) return;
    const list = [...places.values()];
    const groups =
      map.getZoom() >= CLUSTER_MAX_ZOOM
        ? list.map((_, i) => [i])
        : groupOnScreen(list.map((p) => map.project([p.lon, p.lat])), CLUSTER_RADIUS);
    const focusedKey = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.pinKey : undefined;
    const seen = new Set<string>();
    for (const group of groups) {
      const members = group.map((i) => list[i]);
      const key = members.length === 1 ? `p${members[0].key}` : `c${members.map((m) => m.key).join("|")}`;
      seen.add(key);
      if (markers.has(key)) continue;
      let button: HTMLButtonElement;
      let at: [number, number];
      if (members.length > 1) {
        const count = members.reduce((n, m) => n + m.items.length, 0);
        at = [members.reduce((n, m) => n + m.lon, 0) / members.length, members.reduce((n, m) => n + m.lat, 0) / members.length];
        button = pinButton("pv-pin pv-pin--cluster", [{ text: hooks.clusterName(count) }], new Intl.NumberFormat(lang).format(count));
        button.addEventListener("click", () => openCluster(members, at));
      } else {
        const place = members[0];
        at = [place.lon, place.lat];
        const count = place.items.length;
        button = pinButton(
          place.approximate ? "pv-pin pv-pin--approx" : "pv-pin",
          hooks.placeName(place),
          count > 1 ? new Intl.NumberFormat(lang).format(count) : "",
        );
        button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", () => {
          for (const { button: other } of markers.values()) if (other !== button && other.hasAttribute("aria-expanded")) other.setAttribute("aria-expanded", "false");
          button.setAttribute("aria-expanded", "true");
          hooks.onOpen(place, button);
        });
      }
      button.dataset.pinKey = key;
      // Enter and Space press the button (native); keep MapLibre's arrow keys from moving the map while a pin has focus.
      button.addEventListener("keydown", (ev) => {
        if (ev.key.startsWith("Arrow") || ev.key === "+" || ev.key === "-" || ev.key === "=") ev.stopPropagation();
      });
      const marker = new Marker({ element: button, anchor: "center" }).setLngLat(at).addTo(map);
      markers.set(key, { marker, button });
    }
    for (const [key, { marker }] of markers) {
      if (!seen.has(key)) {
        marker.remove();
        markers.delete(key);
      }
    }
    orderButtons(focusedKey);
  }

  /**
   * Tab order follows reading order on screen: top to bottom, then left to right.
   * Buttons outside the visible map leave the Tab order (accessibility gate, fix 1).
   */
  function orderButtons(focusedKey?: string): void {
    const placed = [...markers.values()].map(({ marker, button }) => ({ button, at: map.project(marker.getLngLat()) }));
    placed.sort((a, b) => Math.round(a.at.y / 24) - Math.round(b.at.y / 24) || a.at.x - b.at.x);
    const container = map.getCanvasContainer();
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    for (const { button, at } of placed) {
      button.tabIndex = isOnScreen(at, width, height, 8) ? 0 : -1;
      container.append(button);
    }
    if (focusedKey) markers.get(focusedKey)?.button.focus({ preventScroll: true });
  }

  /** Zooms to the places in a number circle, then puts focus on the nearest button there. */
  function openCluster(members: Place<EngineItem>[], at: [number, number]): void {
    const bounds = new LngLatBounds();
    for (const m of members) bounds.extend([m.lon, m.lat]);
    map.fitBounds(bounds, { ...still, padding: 72, maxZoom: MAX_ZOOM });
    drawButtons();
    const target = map.project(at);
    let best: HTMLButtonElement | null = null;
    let bestDistance = Infinity;
    for (const { marker, button } of markers.values()) {
      const p = map.project(marker.getLngLat());
      const d = (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
      if (d < bestDistance) [best, bestDistance] = [button, d];
    }
    (best ?? map.getCanvas()).focus();
  }

  function fit(items: EngineItem[]): void {
    if (items.length === 0) {
      if (config.basemap) map.fitBounds(config.basemap.bbox, { ...still, padding: 16 });
      return;
    }
    const bounds = new LngLatBounds();
    for (const i of items) bounds.extend([i.lon, i.lat]);
    map.fitBounds(bounds, { ...still, padding: 56, maxZoom: FIT_MAX_ZOOM });
  }

  function update(items: EngineItem[], refit: boolean): void {
    if (!ready) {
      pending = { items, refit };
      return;
    }
    const grouped = groupByPlace(items);
    places = new Map(grouped.map((p) => [p.key, p]));
    // Start fresh: names and counts may have changed with the filters.
    for (const { marker } of markers.values()) marker.remove();
    markers.clear();
    if (refit) fit(items);
    drawButtons();
  }

  return {
    update,
    zoomBy(step) {
      if (step > 0) map.zoomIn(still);
      else map.zoomOut(still);
    },
    centerOn(lon, lat) {
      map.jumpTo({ center: [lon, lat], zoom: NEAR_ME_ZOOM });
    },
    focusCanvas() {
      map.getCanvas().focus();
    },
  };
}
