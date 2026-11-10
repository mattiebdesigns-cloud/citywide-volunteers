// The map itself (decision 0035), loaded only when the person first chooses
// "Map" (scripts/map-view.ts), so the list loads as fast as before.
//
// MapLibre GL JS (BSD-3-Clause; never Mapbox GL) draws the street map from
// small tile files on this site (/map/tiles/z/x/y.mvt, written at build time
// from our PMTiles pieces), fetched with no cookies or credentials. The worker, letters
// and road signs are on this site too (privacy condition 3).
//
// Pins, places and number circles are real <button>s on top of the map, so
// they work by keyboard, have names, and sit in the Tab order from top to
// bottom and left to right. Nothing here records anything: no requests about
// a listing, no storage, nothing in the address, no analytics.
import { LngLatBounds, Map as MapLibre, Marker, addProtocol, setWorkerUrl } from "maplibre-gl";
// MapLibre's stylesheet is not imported here (that would put it on every page); map-view.ts
// adds it from /map/ just before this file loads.
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
  /** The words on a pin's flag: the listing's title (or "2 shifts at this place"), with its language. */
  flagText(place: Place<EngineItem>): { text: string; lang?: string };
  /** A flag just opened: tell screen readers to press again to go to the card. */
  onFlag(): void;
  /** The person pressed a pin whose flag was already showing: go to its card in the list. */
  onJump(place: Place<EngineItem>): void;
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

/** Gzip bytes start with 1f 8b. A host may already have unpacked them (Content-Encoding), so check. */
const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Reads tile z/x/y as one small file from this site (/map/tiles/z/x/y.mvt,
 * written at build time), only where the street map has one: no range
 * requests, which the live host does not serve. Outside the region, or when a
 * tile is missing, the map gets an empty tile.
 */
function addTileProtocol(basemap: NonNullable<MapConfig["basemap"]>): void {
  if (protocolAdded) return;
  protocolAdded = true;
  addProtocol(TILE_PROTOCOL, async (params, abort) => {
    const m = /\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if (!m) throw new Error("bad tile address");
    const [z, x, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (partFor(basemap.parts, z, x, y) < 0) return { data: new Uint8Array() };
    const res = await fetch(basemap.tiles.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)), {
      signal: abort.signal,
      credentials: "omit",
    });
    if (!res.ok || (res.headers.get("content-type") ?? "").includes("html")) return { data: new Uint8Array() };
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { data: isGzip(bytes) ? await gunzip(bytes) : bytes };
  });
}

export function createEngine(canvas: HTMLElement, config: MapConfig, lang: string, locale: Record<string, string>, hooks: EngineHooks): Engine | null {
  setWorkerUrl(new URL(config.worker, location.origin).href);
  if (config.basemap) addTileProtocol(config.basemap);

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
  // Dark mode switch (footer): redraw the street map in the matching colours. The pins are
  // buttons on top of the map, styled by the page's own colours, so they follow by themselves.
  document.addEventListener("pv:themechange", () => {
    map.setStyle(mapStyle({ lang, origin: location.origin, maxzoom: config.basemap?.maxzoom ?? null }));
  });
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

  map.on("moveend", () => {
    drawButtons();
    // An open flag stays inside the frame as the map moves.
    for (const { button } of markers.values()) {
      const flag = button.querySelector<HTMLElement>(".pv-flag");
      if (flag) placeFlag(flag);
    }
  });

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
        // First press: a flag with the title on the pin, and screen readers hear "Press again
        // to go to this shift in the list". Second press: jump to the card (owner, 2026-11-10).
        // Escape closes the flag. (No aria-expanded: nothing opens that a person can move into.)
        button.addEventListener("click", () => {
          if (button.dataset.flag === "open") {
            hooks.onJump(place);
            return;
          }
          closeFlags();
          const words = hooks.flagText(place);
          const flag = document.createElement("span");
          flag.className = "pv-flag";
          flag.setAttribute("aria-hidden", "true"); // the button's own name already says the title
          flag.textContent = words.text;
          if (words.lang) flag.lang = words.lang;
          button.append(flag);
          button.dataset.flag = "open";
          placeFlag(flag);
          hooks.onFlag();
        });
        button.addEventListener("keydown", (ev) => {
          if (ev.key === "Escape" && button.dataset.flag === "open") {
            ev.stopPropagation();
            closeFlags();
          }
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

  /** Takes down any flag that is showing. */
  function closeFlags(): void {
    for (const { button } of markers.values()) {
      if (button.dataset.flag !== "open") continue;
      delete button.dataset.flag;
      button.querySelector(".pv-flag")?.remove();
    }
  }

  /**
   * Keeps a flag inside the map frame (accessibility gate): slides it sideways near
   * the left or right edge, and puts it under the pin when there is no room above.
   */
  function placeFlag(flag: HTMLElement): void {
    flag.style.setProperty("--flag-dx", "0px");
    delete flag.dataset.below;
    const box = map.getContainer().getBoundingClientRect();
    const pad = 4;
    let r = flag.getBoundingClientRect();
    if (r.top < box.top + pad) {
      flag.dataset.below = "true";
      r = flag.getBoundingClientRect();
    }
    let dx = 0;
    if (r.left < box.left + pad) dx = box.left + pad - r.left;
    else if (r.right > box.right - pad) dx = box.right - pad - r.right;
    flag.style.setProperty("--flag-dx", `${Math.round(dx)}px`);
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
