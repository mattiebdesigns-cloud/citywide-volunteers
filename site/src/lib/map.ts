// The day map and the Flexible and Teams maps (decision 0035; PROJECT.md 2, 8.1).
// Pure functions shared by the build and the browser, so they can be tested
// without a page or a map.
//
// Where pins come from: the pipeline works out each listing's map point once,
// at build time, from the listing's own address (decision 0035 point 2). The
// listing carries it as `lat`, `lon` and `approximate` (optional
// fields; docs/EVENT-FORMAT.md once pv-schema adds them). Nothing is looked up
// in the visitor's browser.
//
// Sensitive listings (PROJECT.md 8.1; owner Q119): nothing here reads
// `sensitive`. A sensitive listing is pinned at its published place like any
// other listing, drawn and worded the same way.
import { addDays } from "./time.ts";

/** A listing's map point. `approximate`: the center of a neighborhood or park, not a street address. */
export interface MapPoint {
  lat: number;
  lon: number;
  approximate: boolean;
}

/** Coordinates are kept to 5 decimal places (about 1 m): enough for a pin, and shorter pages. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * The map point from a listing's optional fields, or null when it has none
 * that can be used. The format sends `lat`, `lon` and `approximate` together,
 * all three or none (docs/event.schema.json): a point without a true/false
 * `approximate` is incomplete and counts as none, so an area's center is
 * never mistaken for an address and offered directions. Both numbers must be
 * in range; 0,0 (a common "not found" answer from geocoders) counts as none.
 */
export function mapPoint(e: { lat?: unknown; lon?: unknown; approximate?: unknown }): MapPoint | null {
  const { lat, lon } = e;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (typeof e.approximate !== "boolean") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat: round(lat), lon: round(lon), approximate: e.approximate === true };
}

/** One item the map can show: a card in the list that has a map point. */
export interface PinItem extends MapPoint {
  id: string;
}

/** One place on the map: every shown item at the same point (and the same kind of point). */
export interface Place<T extends PinItem> extends MapPoint {
  key: string;
  items: T[];
}

/**
 * Groups items that share a point, so two shifts at one address are one pin
 * ("2 shifts at this place") instead of two pins on top of each other.
 * Places keep the items' order (the list's order, soonest first).
 */
export function groupByPlace<T extends PinItem>(items: readonly T[]): Place<T>[] {
  const places = new Map<string, Place<T>>();
  for (const item of items) {
    const key = `${item.lat.toFixed(5)},${item.lon.toFixed(5)},${item.approximate ? "a" : "e"}`;
    const place = places.get(key);
    if (place) place.items.push(item);
    else places.set(key, { key, lat: item.lat, lon: item.lon, approximate: item.approximate, items: [item] });
  }
  return [...places.values()];
}

/** A piece of a filled-in sentence, with its own language when it is the organization's words. */
export interface TextPart {
  text: string;
  lang?: string;
}

/**
 * Fills a template such as "{title}, {time}" into pieces, so the title can
 * carry its own language (lang="es") inside a pin's name. Unknown
 * placeholders stay visible, like the translation helper's fill().
 */
export function templateParts(template: string, vars: Record<string, TextPart>): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{([a-z_]+)\}/g)) {
    if (m.index > last) out.push({ text: template.slice(last, m.index) });
    const v = vars[m[1]];
    out.push(v ? { ...v } : { text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last) });
  return out.filter((p) => p.text !== "");
}

/**
 * "Get directions" (decision 0035 point 3; owner Q119). A plain link the
 * person taps; it carries only the address, or the point when the listing
 * has no street address, never the title, organization, listing id or our
 * site's name. Apple devices open Apple Maps; others open Google Maps.
 * Approximate areas get no directions: the point is a neighborhood's
 * center, not a place to go.
 */
export function directionsUrl(
  place: { address: string | null; lat: number; lon: number; approximate: boolean },
  apple: boolean,
): string | null {
  if (place.approximate) return null;
  const address = place.address?.trim();
  const to = encodeURIComponent(address ? address : `${place.lat},${place.lon}`);
  return apple ? `https://maps.apple.com/?daddr=${to}` : `https://www.google.com/maps/dir/?api=1&destination=${to}`;
}

/** True on iPhone, iPad and Mac, where Apple Maps is the maps app. */
export function isApple(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent);
}

/**
 * The one fixed address ending that opens the map on the home page (owner,
 * 2026-11-10: "See the map" on the About page). It only opens the map: it
 * never carries a position, day, filter or listing, and the page never writes it.
 */
export const MAP_HASH = "#map";

// ---- The day picker ----

/**
 * The days the day map can show: from today to the last day with a listing
 * (at least today). Dates are local YYYY-MM-DD strings.
 */
export function dayRange(today: string, dates: Iterable<string>): { first: string; last: string } {
  let last = today;
  for (const d of dates) if (d > last) last = d;
  return { first: today, last };
}

/** The day before or after, or null at either end of the range. */
export function stepDay(day: string, step: -1 | 1, range: { first: string; last: string }): string | null {
  const next = addDays(day, step);
  return next < range.first || next > range.last ? null : next;
}

/** A day kept inside the range (a chosen date before today shows today). */
export function clampDay(day: string, range: { first: string; last: string }): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return range.first;
  return day < range.first ? range.first : day > range.last ? range.last : day;
}

/** "Tuesday, November 10" / "martes, 10 de noviembre": weekday and full date in words. */
export function dayInWords(day: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

// ---- The street map file (decision 0035; scraping-licence condition 4, 6) ----

/** One piece of the street map: a PMTiles file holding some zoom levels of part of the region. */
export interface BasemapPart {
  /** File name in the published map folder. */
  file: string;
  minzoom: number;
  maxzoom: number;
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  bytes: number;
  sha256: string;
}

/** What scripts/cut-basemap.mjs writes next to the map files (basemap.json). */
export interface BasemapManifest {
  /** The Protomaps build the pieces were cut from, e.g. "20261109". */
  build: string;
  /** The build's data version, e.g. "4.15.2". */
  version: string;
  /** Where the build came from. */
  source: string;
  /** When the pieces were cut, YYYY-MM-DD. */
  cut_on: string;
  bbox: [number, number, number, number];
  maxzoom: number;
  /** The exact commands that made the pieces (published with the ODbL notice). */
  commands: string[];
  parts: BasemapPart[];
}

/** Tile x and y at zoom z for a point (Web Mercator, as map tiles use). */
export function tileXY(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/**
 * Which piece holds tile z/x/y, or -1 when none does (outside the region).
 * A tile on the edge between two pieces is in both; the first one wins.
 */
export function partFor(parts: readonly Pick<BasemapPart, "minzoom" | "maxzoom" | "bbox">[], z: number, x: number, y: number): number {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (z < p.minzoom || z > p.maxzoom) continue;
    const [w, s, e, n] = p.bbox;
    const nw = tileXY(w, n, z);
    const se = tileXY(e, s, z);
    if (x >= nw.x && x <= se.x && y >= nw.y && y <= se.y) return i;
  }
  return -1;
}

/** Checks a manifest's shape, with a plain message for the build. */
export function checkManifest(m: BasemapManifest, source: string): void {
  const problems: string[] = [];
  if (!m || typeof m !== "object") problems.push("not a JSON object");
  else {
    if (!/^\d{8}$/.test(String(m.build))) problems.push('"build" must be the Protomaps build date, such as 20261109');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.cut_on))) problems.push('"cut_on" must be a date, YYYY-MM-DD');
    if (!Array.isArray(m.commands) || m.commands.length === 0) problems.push('"commands" must list the commands used');
    if (!Array.isArray(m.parts) || m.parts.length === 0) problems.push('"parts" must list the map files');
    else {
      for (const p of m.parts) {
        if (!/^[a-z0-9._-]+\.pmtiles$/.test(String(p.file))) problems.push(`part file name ${JSON.stringify(p.file)} is not usable`);
        if (!(Number.isInteger(p.minzoom) && Number.isInteger(p.maxzoom) && p.minzoom <= p.maxzoom)) {
          problems.push(`part ${p.file}: minzoom and maxzoom must be whole numbers, minzoom first`);
        }
        if (!Array.isArray(p.bbox) || p.bbox.length !== 4) problems.push(`part ${p.file}: bbox must be [west, south, east, north]`);
      }
    }
  }
  if (problems.length) throw new Error(`The street map description ${source} cannot be used:\n  - ${problems.join("\n  - ")}`);
}

// ---- Number circles ----

/**
 * Groups points that sit closer than `radius` pixels on screen, so crowded
 * pins become one number circle. Greedy and in order: each point not yet in
 * a group starts one and takes in every later point within `radius` of it.
 * Returns groups of indexes into `points`, in the points' order.
 */
export function groupOnScreen(points: ReadonlyArray<{ x: number; y: number }>, radius: number): number[][] {
  const taken = new Array<boolean>(points.length).fill(false);
  const groups: number[][] = [];
  const r2 = radius * radius;
  for (let i = 0; i < points.length; i++) {
    if (taken[i]) continue;
    taken[i] = true;
    const group = [i];
    for (let j = i + 1; j < points.length; j++) {
      if (taken[j]) continue;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      if (dx * dx + dy * dy <= r2) {
        taken[j] = true;
        group.push(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** Joins sentence pieces, dropping a doubled full stop where two meet ("p. m." + ". Zona aproximada."). */
export function joinParts(parts: TextPart[]): TextPart[] {
  const out = parts.map((p) => ({ ...p }));
  for (let i = 1; i < out.length; i++) {
    if (out[i].text.startsWith(".") && out[i - 1].text.endsWith(".")) out[i].text = out[i].text.slice(1);
  }
  return out.filter((p) => p.text !== "");
}

/**
 * True when a button's center is inside the visible map (accessibility gate,
 * fix 1): buttons outside it leave the Tab order, so keyboard focus never
 * lands on a pin nobody can see. `inset` keeps a pin cut in half at the edge out too.
 */
export function isOnScreen(p: { x: number; y: number }, width: number, height: number, inset = 0): boolean {
  return p.x >= inset && p.y >= inset && p.x <= width - inset && p.y <= height - inset;
}
