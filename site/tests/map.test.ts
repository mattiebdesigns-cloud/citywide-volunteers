// The day map and the Flexible and Teams maps (decision 0035; PROJECT.md 2,
// 5, 8.1; gate conditions of 2026-11-10 in STATUS.md; checklist lines Q117,
// Q118, Q120, Q123). Run from site/: npm test
//
// The sample listings have no map points yet (the pipeline step comes after
// pv-source-research's geocoder check), so these tests add points to copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { astroBuild, buildFolder, removeFolder } from "./build-helper.ts";
import { zxyToTileId } from "pmtiles";
import {
  checkManifest,
  clampDay,
  dayInWords,
  dayRange,
  directionsUrl,
  groupByPlace,
  groupOnScreen,
  isApple,
  isOnScreen,
  MAP_HASH,
  joinParts,
  mapPoint,
  partFor,
  stepDay,
  templateParts,
  tileXY,
  type BasemapManifest,
} from "../src/lib/map.ts";
import { mapStyle } from "../src/lib/map-style.ts";
import { isSensitive, prepareListings, prepareOpportunities } from "../src/lib/prepare.ts";
import { FONTS, RANGES, assetList } from "../scripts/fetch-map-assets.mjs";
import type { EventsFile, OpportunitiesFile, SiteSettings } from "../src/lib/types.ts";

const site = fileURLToPath(new URL("..", import.meta.url));
const settings: SiteSettings = JSON.parse(readFileSync(join(site, "settings.example.json"), "utf8"));
const sample: EventsFile = JSON.parse(readFileSync(join(site, "../docs/examples/events.sample.json"), "utf8"));
const sampleOpp: OpportunitiesFile = JSON.parse(readFileSync(join(site, "../docs/examples/opportunities.sample.json"), "utf8"));
const lang = (code: string) => JSON.parse(readFileSync(join(site, `src/i18n/${code}.json`), "utf8"));
const before = new Date("2026-10-01T00:00:00Z");

/** Code without // and /* *\/ comments, for "never does X" checks. */
const code = (file: string) =>
  readFileSync(join(site, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---- Map points (decision 0035 point 2) ----

test("calendar file: the title the page shows (decision 0036), else the organization's own", async () => {
  const { buildIcs } = await import("../src/lib/ics.ts");
  const e = sample.events[0];
  assert.match(buildIcs(e, { location: "x", description: "y", summary: "Título en español" }), /SUMMARY:Título en español/);
  assert.ok(buildIcs(e, { location: "x", description: "y" }).includes(`SUMMARY:${e.title.replace(/,/g, "\\,")}`));
});

test("map point: both numbers in range, kept to 5 decimals; anything else is no point", () => {
  assert.deepEqual(mapPoint({ lat: 39.9711234567, lon: -75.1345678901, approximate: false }), { lat: 39.97112, lon: -75.13457, approximate: false });
  assert.deepEqual(mapPoint({ lat: 39.97, lon: -75.13, approximate: true }), { lat: 39.97, lon: -75.13, approximate: true });
  // All three or none (docs/event.schema.json): without a true/false approximate the point is incomplete,
  // so an area's center can never pass as an exact address and get directions.
  assert.equal(mapPoint({ lat: 39.97, lon: -75.13 }), null);
  assert.equal(mapPoint({ lat: 39.97, lon: -75.13, approximate: "yes" }), null);
  assert.equal(mapPoint({ lat: 39.97, lon: -75.13, location_approximate: true } as never), null, "the old draft name is not read");
  for (const bad of [
    {},
    { lat: 39.97, approximate: false },
    { lon: -75.13, approximate: false },
    { approximate: true },
    { lat: "39.97", lon: "-75.13", approximate: false },
    { lat: 91, lon: 0, approximate: false },
    { lat: 0, lon: 181, approximate: false },
    { lat: 0, lon: 0, approximate: false },
    { lat: Number.NaN, lon: -75, approximate: false },
    { lat: null, lon: null, approximate: false },
  ]) {
    assert.equal(mapPoint(bad as never), null, JSON.stringify(bad));
  }
});

test("prepared listings and opportunities carry the point, or null; sensitive ones are treated the same", () => {
  const file = structuredClone(sample);
  Object.assign(file.events[0], { lat: 39.97, lon: -75.13, approximate: false });
  const sens = file.events.find((e) => isSensitive(e))!;
  Object.assign(sens, { lat: 39.95, lon: -75.16, approximate: false });
  Object.assign(file.events[1], { lat: 500, lon: -75, approximate: false }); // unusable: dropped
  const out = prepareListings(file, settings, { now: before });
  const byId = (id: string) => out.find((e) => e.id === id)!;
  assert.deepEqual([byId(file.events[0].id).lat, byId(file.events[0].id).lon, byId(file.events[0].id).approximate], [39.97, -75.13, false]);
  assert.deepEqual([byId(sens.id).lat, byId(sens.id).lon], [39.95, -75.16], "a sensitive listing keeps its published point (owner Q119)");
  assert.deepEqual([byId(file.events[1].id).lat, byId(file.events[1].id).lon], [null, null]);
  const opp = structuredClone(sampleOpp);
  Object.assign(opp.opportunities[0], { lat: 39.98, lon: -75.12, approximate: true });
  const prepared = prepareOpportunities(opp, settings);
  const o = prepared.find((x) => x.id === opp.opportunities[0].id)!;
  assert.deepEqual([o.lat, o.lon, o.approximate], [39.98, -75.12, true]);
});

test("sensitive is decided in one shared function, used by listings and opportunities (sensitive-events condition 4)", () => {
  assert.equal(isSensitive({ sensitive: false, type: "protest_action" }), true);
  assert.equal(isSensitive({ sensitive: true, type: "service" }), true);
  assert.equal(isSensitive({ sensitive: false, type: "service" }), false);
  const prepare = code("src/lib/prepare.ts");
  assert.equal((prepare.match(/protest_action"/g) ?? []).length, 1, "protest_action is tested in one place only");
  assert.equal((prepare.match(/sensitive: isSensitive\(/g) ?? []).length, 2);
  // The map code never reads "sensitive": sensitive pins are drawn and named like every other.
  for (const file of ["src/lib/map.ts", "src/lib/map-build.ts", "src/lib/map-style.ts", "src/scripts/map-view.ts", "src/scripts/map-engine.ts"]) {
    assert.doesNotMatch(code(file), /sensitive|protest/i, file);
  }
});

test("places: listings at one point share one pin; exact and approximate stay apart; list order kept", () => {
  const items = [
    { id: "a", lat: 39.97, lon: -75.13, approximate: false },
    { id: "b", lat: 39.95, lon: -75.16, approximate: false },
    { id: "c", lat: 39.97, lon: -75.13, approximate: false },
    { id: "d", lat: 39.97, lon: -75.13, approximate: true },
  ];
  const places = groupByPlace(items);
  assert.deepEqual(places.map((p) => p.items.map((i) => i.id)), [["a", "c"], ["b"], ["d"]]);
  assert.equal(places[2].approximate, true);
});

test("pin names: the title keeps its own language inside the sentence", () => {
  const parts = templateParts("{title}, {time}", { title: { text: "Cocina comunitaria", lang: "es" }, time: { text: "6:00 PM" } });
  assert.deepEqual(parts, [{ text: "Cocina comunitaria", lang: "es" }, { text: ", " }, { text: "6:00 PM" }]);
  assert.deepEqual(templateParts("{a} and {b}", { a: { text: "x" } }), [{ text: "x" }, { text: " and " }, { text: "{b}" }]);
});

test("number circles: places closer than one pin's width on screen share a circle; the rest stand alone", () => {
  const pts = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 40 }, { x: 230, y: 10 }];
  assert.deepEqual(groupOnScreen(pts, 44), [[0, 1, 3], [2, 4]]);
  assert.deepEqual(groupOnScreen(pts, 1), [[0], [1], [2], [3], [4]]);
  assert.deepEqual(groupOnScreen([], 44), []);
});

test("approximate pin names never end with a doubled full stop (Spanish times end in 'p. m.')", () => {
  const parts = joinParts([{ text: "Taller", lang: "es" }, { text: ", " }, { text: "De 11:00 p. m. a 11:45 p. m." }, { text: ". Zona aproximada." }]);
  assert.equal(parts.map((p) => p.text).join(""), "Taller, De 11:00 p. m. a 11:45 p. m. Zona aproximada.");
  assert.equal(parts[0].lang, "es");
});

test("a pin: first press shows a title flag, the second jumps to its card; Escape closes; nothing in the address (owner, 2026-11-10)", () => {
  const engine = code("src/scripts/map-engine.ts");
  assert.match(engine, /if \(button\.dataset\.flag === "open"\) \{\s*hooks\.onJump\(place\);/);
  assert.doesNotMatch(engine, /aria-expanded/, "no expanded state on pins (accessibility gate)");
  assert.match(engine, /hooks\.onFlag\(\)/, "the 'press again' hint is announced");
  assert.match(engine, /function placeFlag/, "the flag is kept inside the map frame");
  assert.match(engine, /flag\.className = "pv-flag";/);
  assert.match(engine, /ev\.key === "Escape"/);
  const view = code("src/scripts/map-view.ts");
  const jump = view.slice(view.indexOf("function jumpTo"), view.indexOf("function showDirections"));
  assert.match(jump, /scrollIntoView/);
  assert.match(jump, /\.focus\(/);
  assert.doesNotMatch(jump, /location|history|hash|Storage|fetch/);
  // The flag stays inside the frame (slides near an edge, goes under the pin at the top) and above the zoom buttons.
  const view2 = readFileSync(join(site, "src/components/MapView.astro"), "utf8");
  assert.match(view2, /translateX\(calc\(-50% \+ var\(--flag-dx, 0px\)\)\)/);
  assert.match(view2, /:global\(\.pv-flag\[data-below="true"\]\)/);
  assert.match(view2, /:global\(\.pv-pin\[data-flag="open"\]\) \{\s*z-index: 5;/);
  // "Skip the map" is in the page, hidden until it has keyboard focus (owner: "Hide until tabbed").
  assert.match(view2, /\.map__skip \{\s*position: absolute;[\s\S]*?clip: rect\(0 0 0 0\);/);
  assert.match(view2, /\.map__skip:focus \{[\s\S]*?outline: 3px solid var\(--color-focus\);/);
  // Each directions link has its own name: "Get directions to <title>", the title in its own language.
  assert.match(readFileSync(join(site, "src/components/MapCardLines.astro"), "utf8"), /t\("map\.directions_to"\)/);
  // The details box is gone.
  assert.doesNotMatch(readFileSync(join(site, "src/components/MapView.astro"), "utf8"), /data-map-detail/);
});

test("pins outside the visible map leave the Tab order (accessibility gate fix 1)", () => {
  assert.ok(isOnScreen({ x: 10, y: 10 }, 360, 480, 8));
  assert.ok(!isOnScreen({ x: 4, y: 10 }, 360, 480, 8), "cut off at the edge");
  assert.ok(!isOnScreen({ x: 30000, y: 200 }, 360, 480));
  assert.ok(!isOnScreen({ x: 100, y: -20 }, 360, 480));
  // The engine applies it to every button after each move.
  const engine = code("src/scripts/map-engine.ts");
  assert.match(engine, /button\.tabIndex = isOnScreen\(at, width, height, 8\) \? 0 : -1;/);
  assert.match(engine, /map\.on\("moveend", \(\) => \{\s*drawButtons\(\);/);
});

test("every class the map scripts make is styled globally, so script-made buttons get their size and focus ring (fix 3)", () => {
  const made = new Set<string>();
  for (const file of ["src/scripts/map-view.ts", "src/scripts/map-engine.ts"]) {
    const c = code(file);
    for (const m of c.matchAll(/className = "([^"]+)"/g)) m[1].split(/\s+/).forEach((x) => made.add(x));
    for (const m of c.matchAll(/classList\.add\("([^"]+)"\)/g)) made.add(m[1]);
    for (const m of c.matchAll(/el\("[a-z0-9]+", [^,()]+, "([^"]+)"\)/g)) m[1].split(/\s+/).forEach((x) => made.add(x));
    for (const m of c.matchAll(/pinButton\(\s*(?:place\.approximate \? )?"([^"]+)"(?: : "([^"]+)")?/g)) [m[1], m[2] ?? ""].join(" ").split(/\s+/).filter(Boolean).forEach((x) => made.add(x));
  }
  for (const m of code("src/scripts/map-engine.ts").matchAll(/flag\.className = "([^"]+)"/g)) made.add(m[1]);
  for (const x of ["pv-pin", "pv-pin--cluster", "pv-pin--approx", "pv-pin__shape", "pv-flag", "is-map-selected"]) {
    assert.ok(made.has(x), `found ${x} in the scripts`);
  }
  const component = readFileSync(join(site, "src/components/MapView.astro"), "utf8");
  const globalCss = ["base.css", "global.css", "tokens.css", "forms.css"].map((f) => readFileSync(join(site, "src/styles", f), "utf8")).join("\n");
  const globals = [...component.matchAll(/:global\(([^)]*)\)/g)].map((m) => m[1]).join(" ");
  for (const x of made) {
    const styled = new RegExp(`\\.${x}(?![\\w-])`).test(globals) || new RegExp(`(^|[\\s,}])\\.${x}(?![\\w-])`, "m").test(globalCss);
    assert.ok(styled, `.${x} is made by a script and must be styled globally`);
  }
});

test("'See the map' opens the home page's map through the fixed #map only", () => {
  assert.equal(MAP_HASH, "#map");
  const about = readFileSync(join(site, "src/pages/[lang]/about/index.astro"), "utf8");
  assert.match(about, /href=\{paths\.homeMap\(lang\)\}>\{t\("about_page\.shifts\.map_link"\)\}/);
  assert.match(readFileSync(join(site, "src/lib/site.ts"), "utf8"), /homeMap: \(lang: string\) => `\/\$\{lang\}\/#map`,/);
});

// ---- Get directions (owner Q119; sensitive-events condition 5) ----

test("directions carry only the address (or the point), never the title, organization or id", () => {
  const where = { address: "100 Example Street, Philadelphia, PA 19125", lat: 39.97, lon: -75.13, approximate: false };
  const apple = directionsUrl(where, true)!;
  const other = directionsUrl(where, false)!;
  assert.equal(apple, "https://maps.apple.com/?daddr=100%20Example%20Street%2C%20Philadelphia%2C%20PA%2019125");
  assert.equal(other, "https://www.google.com/maps/dir/?api=1&destination=100%20Example%20Street%2C%20Philadelphia%2C%20PA%2019125");
  assert.equal(directionsUrl({ ...where, address: null }, false), "https://www.google.com/maps/dir/?api=1&destination=39.97%2C-75.13");
  assert.equal(directionsUrl({ ...where, approximate: true }, false), null, "an approximate area is not a place to go");
  assert.ok(isApple("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"));
  assert.ok(!isApple("Mozilla/5.0 (Linux; Android 15)"));
  // The function takes only the place: no title, organization or id can get in.
  const signature = code("src/lib/map.ts").match(/export function directionsUrl\(([\s\S]*?)\): string \| null/)![1];
  assert.doesNotMatch(signature, /title|org|id\b/);
  // The link is plain, with no referrer; its address is filled in only while the map is on.
  const lines = readFileSync(join(site, "src/components/MapCardLines.astro"), "utf8");
  assert.match(lines, /<a class="map-directions__link" rel="noopener noreferrer" referrerpolicy="no-referrer"/);
  assert.doesNotMatch(lines, /href=/, "no address in the page until the map is on");
  const view = code("src/scripts/map-view.ts");
  assert.doesNotMatch(view, /prefetch|preload|window\.open|\.click\(\)/);
});

// ---- The day picker (accessibility condition 6) ----

test("day picker: today to the last day with listings; weekday and full date in words", () => {
  const r = dayRange("2026-11-10", ["2026-11-12", "2026-11-09", "2026-11-20"]);
  assert.deepEqual(r, { first: "2026-11-10", last: "2026-11-20" });
  assert.deepEqual(dayRange("2026-11-10", []), { first: "2026-11-10", last: "2026-11-10" });
  assert.equal(stepDay("2026-11-10", -1, r), null);
  assert.equal(stepDay("2026-11-10", 1, r), "2026-11-11");
  assert.equal(stepDay("2026-11-20", 1, r), null);
  assert.equal(clampDay("2026-11-01", r), "2026-11-10");
  assert.equal(clampDay("2027-01-01", r), "2026-11-20");
  assert.equal(clampDay("nonsense", r), "2026-11-10");
  assert.equal(dayInWords("2026-11-10", "en"), "Tuesday, November 10");
  assert.equal(dayInWords("2026-11-10", "es"), "martes, 10 de noviembre");
});

// ---- The street map pieces (scraping-licence conditions 4 to 6) ----

const parts: BasemapManifest["parts"] = [
  { file: "basemap-20261109-0.pmtiles", minzoom: 0, maxzoom: 12, bbox: [-76.15, 39.45, -74.38, 40.61], bytes: 1, sha256: "x" },
  { file: "basemap-20261109-1.pmtiles", minzoom: 13, maxzoom: 13, bbox: [-76.15, 39.45, -74.38, 40.61], bytes: 1, sha256: "x" },
  { file: "basemap-20261109-2.pmtiles", minzoom: 14, maxzoom: 14, bbox: [-76.15, 39.45, -75.265, 40.61], bytes: 1, sha256: "x" },
  { file: "basemap-20261109-3.pmtiles", minzoom: 14, maxzoom: 14, bbox: [-75.265, 39.45, -74.38, 40.03], bytes: 1, sha256: "x" },
];

test("tiles are read from the piece that holds them; outside the region, none", () => {
  const at = (z: number, lon: number, lat: number) => {
    const { x, y } = tileXY(lon, lat, z);
    return partFor(parts, z, x, y);
  };
  assert.deepEqual(tileXY(0, 0, 1), { x: 1, y: 1 });
  assert.equal(at(10, -75.16, 39.95), 0);
  assert.equal(at(13, -75.16, 39.95), 1);
  assert.equal(at(14, -75.5, 40.0), 2, "west half");
  assert.equal(at(14, -75.0, 39.9), 3, "south-east quarter");
  assert.equal(at(14, -75.0, 40.4), -1, "no piece there");
  assert.equal(at(12, -80, 35), -1, "outside the region");
  assert.equal(at(15, -75.16, 39.95), -1, "past the highest zoom (the map draws z14 larger)");
});

test("the street map description is checked, with plain messages", () => {
  const good: BasemapManifest = {
    build: "20261109",
    version: "4.15.2",
    source: "https://build.protomaps.com/20261109.pmtiles",
    cut_on: "2026-11-10",
    bbox: [-76.15, 39.45, -74.38, 40.61],
    maxzoom: 14,
    commands: ["pmtiles extract ..."],
    parts,
  };
  checkManifest(good, "basemap.json");
  assert.throws(() => checkManifest({ ...good, build: "latest" }, "b"), /build/);
  assert.throws(() => checkManifest({ ...good, commands: [] }, "b"), /commands/);
  assert.throws(() => checkManifest({ ...good, parts: [{ ...parts[0], file: "../x.pmtiles" }] }, "b"), /file name/);
});

test("the cut script's outside-the-repo check follows links and is not fooled by '..x' names; no private path in the public repo", async () => {
  const { insideRepo } = await import("../scripts/cut-basemap.mjs");
  const { mkdtempSync, symlinkSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const repo = join(site, "..");
  assert.equal(insideRepo(repo), true);
  assert.equal(insideRepo(join(repo, "site/x/basemap")), true, "a folder not made yet, inside");
  assert.equal(insideRepo(join(repo, "..x")), true, "'..x' is a name inside the repo");
  const outside = mkdtempSync(join(tmpdir(), "pv-cut-"));
  try {
    assert.equal(insideRepo(join(outside, "basemap")), false);
    symlinkSync(repo, join(outside, "link"));
    assert.equal(insideRepo(join(outside, "link", "basemap")), true, "a link into the repo is inside");
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
  const script = readFileSync(join(site, "scripts/cut-basemap.mjs"), "utf8");
  assert.doesNotMatch(script, /philly-volunteers|\/Users\/|~\/code/);
  assert.match(script, /CitywideVolunteersBot/);
});

test("the cut script plans from one dated build, downloads only with --download, and refuses to write inside this repo", () => {
  const script = readFileSync(join(site, "scripts/cut-basemap.mjs"), "utf8");
  assert.match(script, /--build YYYYMMDD is needed/);
  assert.match(script, /"--dry-run"/);
  assert.match(script, /if \(!opt\.download\) \{/);
  assert.match(script, /is inside the public repo/);
  assert.match(script, /limitMib: 25/, "Cloudflare Pages serves files up to 25 MiB");
  assert.doesNotMatch(script, /latest\.pmtiles|planet\.pmtiles/, "never a moving 'latest' build");
});

// ---- Map style: every file from our own site (privacy condition 3) ----

test("map style: every address is on our own site; letters and road signs are the files we host", () => {
  const origin = "https://example.org";
  const withMap = mapStyle({ lang: "es", origin, maxzoom: 14 });
  const urls = JSON.stringify(withMap).match(/[a-z]+:\/\/[^"]+/g) ?? [];
  assert.ok(urls.length >= 3);
  for (const u of urls) assert.ok(u.startsWith(origin) || u.startsWith("pvtiles://"), u);
  assert.ok(!JSON.stringify(withMap).includes("protomaps.github.io"));
  // Every font the style asks for is one we host, in every range we host.
  // (text-font can be an expression; the font names are the strings that start with "Noto".)
  const fonts = new Set<string>();
  const collect = (v: unknown): void => {
    if (typeof v === "string" && v.startsWith("Noto")) fonts.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
  };
  for (const layer of withMap.layers) collect((layer as { layout?: Record<string, unknown> }).layout?.["text-font"]);
  assert.ok(fonts.size > 0);
  // Devanagari is used only for names written in Devanagari script; without it they show no letters (no outside request).
  for (const name of fonts) assert.ok(FONTS.includes(name) || name.startsWith("Noto Sans Devanagari"), `${name} is hosted`);
  for (const name of FONTS) for (const range of RANGES) assert.ok(existsSync(join(site, `public/map/fonts/${name}/${range}.pbf`)), `${name} ${range}`);
  assert.ok(existsSync(join(site, "public/map/fonts/OFL.txt")), "the font licence ships with the fonts");
  assert.ok(existsSync(join(site, "public/map/sprites/LICENSE.md")), "the icons' licence ships with them");
  assert.ok(assetList().every((a) => a.url.startsWith("https://raw.githubusercontent.com/") && /\/[0-9a-f]{40}\//.test(a.url)), "pinned commits");
  // No street map in this build: a plain background, nothing to load.
  const plain = mapStyle({ lang: "en", origin, maxzoom: null });
  assert.deepEqual(Object.keys(plain.sources), []);
  assert.equal(plain.layers.length, 1);
  assert.equal(plain.glyphs, undefined);
});

test("map libraries: MapLibre and pmtiles only; never Mapbox GL", () => {
  const pkg = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["maplibre-gl"], "6.17.0");
  assert.equal(pkg.dependencies.pmtiles, "4.5.0");
  assert.equal(pkg.dependencies["@protomaps/basemaps"], "5.7.2");
  const lock = readFileSync(join(site, "package-lock.json"), "utf8");
  assert.doesNotMatch(lock, /"node_modules\/mapbox-gl"/);
});

// ---- Nothing recorded (privacy conditions 1, 2, 4, 5; sensitive-events conditions 1 to 3) ----

test("map scripts send nothing about a listing, store nothing, never change the address", () => {
  for (const file of ["src/scripts/map-view.ts", "src/scripts/map-engine.ts", "src/lib/map.ts", "src/lib/map-style.ts"]) {
    // The engine's one fetch is for street map tile files on this site (checked below); nothing else fetches.
    const c = code(file).replace(/const res = await fetch\(basemap\.tiles[\s\S]*?credentials: "omit",\s*\}\);/, "");
    for (const banned of [
      "XMLHttpRequest",
      "sendBeacon",
      "WebSocket",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "cookie",
      "pushState",
      "replaceState",
      "location.search",
      "location.href",
      "history.",
      "fetch(",
      "watchPosition",
      "cloudflareinsights",
      "beacon",
    ]) {
      assert.ok(!c.includes(banned), `${file}: no ${banned}`);
    }
  }
  // The address: read once, only to compare with the fixed #map (About page link); never written.
  const view0 = code("src/scripts/map-view.ts");
  assert.deepEqual(view0.match(/location\.hash[^\n]*/g), ["location.hash === MAP_HASH && !switcher.hidden) {"]);
  assert.doesNotMatch(view0 + code("src/scripts/map-engine.ts"), /location\.hash\s*=[^=]|\.hash\s*=[^=]/);
  const engine = code("src/scripts/map-engine.ts");
  assert.equal((engine.match(/fetch\(/g) ?? []).length, 1, "one fetch, for tile files only");
  assert.match(engine, /fetch\(basemap\.tiles\.replace/);
  assert.match(engine, /hash: false/, "the map never writes its position into the address");
  assert.match(engine, /attributionControl: false/);
  assert.match(engine, /cooperativeGestures: true/, "one finger scrolls the page (accessibility condition 5)");
  assert.match(engine, /export const NEAR_ME_ZOOM = 13;/, "near me stops at neighborhood level");
  assert.doesNotMatch(engine, /flyTo|easeTo|animate: true/, "no fly-to animation (reduced motion)");
  // Near me runs only on a tap: the one location call is inside the button's click handler.
  const view = code("src/scripts/map-view.ts");
  assert.equal((view.match(/getCurrentPosition/g) ?? []).length, 1);
  const handler = view.indexOf('q<HTMLButtonElement>("[data-map-near]")?.addEventListener("click"');
  assert.ok(handler > 0 && view.indexOf("getCurrentPosition") > handler);
  // The map's day and on/off state are never stored with the filters.
  for (const file of ["src/scripts/filters.ts", "src/scripts/flexible-filters.ts"]) {
    for (const call of code(file).matchAll(/writeFilters\(([^)]*)\)/g)) assert.doesNotMatch(call[1], /effective|map|day\b/, `${file}: ${call[0]}`);
  }
});

// ---- Words (rule 10; accessibility condition 7) ----

test("every map word is in English and Spanish, plurals included", () => {
  const en = lang("en");
  const es = lang("es");
  for (const kind of ["dated", "flexible", "teams"]) {
    for (const group of ["cluster", "place", "no_location"]) {
      for (const form of ["one", "other"]) {
        assert.ok(en.map[group][kind][form] && es.map[group][kind][form], `map.${group}.${kind}.${form}`);
        assert.match(en.map[group][kind][form], /\{count\}/);
      }
    }
  }
  assert.match(en.map.cluster.dated.other, /^\{count\} shifts here; zoom in to see them$/);
  assert.match(en.map.day.previous, /\{date\}/);
  assert.match(en.map.day.next, /\{date\}/);
  assert.equal(en.map.directions_note, "Opens your maps app. That service will see this shift's address.");
  assert.match(en.map.directions_to, /\{title\}/);
  assert.match(es.map.directions_to, /\{title\}/);
  assert.ok(en.map.pin_hint && es.map.pin_hint);
  assert.match(en.map.near_me_note, /stays on your device/);
  assert.match(en.map.near_me_note, /from our server/, "honest: the map loads the area from our server (privacy condition 1)");
  assert.doesNotMatch(en.map.near_me_note + es.map.near_me_note, /never sent|nunca se env/i);
  assert.match(en.map.credit, /\{protomaps\}.*©.*\{osm\}/);
  assert.match(es.map.credit, /\{protomaps\}.*©.*\{osm\}/);
});

// ---- Built pages ----

/** Moves a time 100 years ahead, so the build never drops the listing as past. */
const shift = (iso: string) => iso.replace(/^20(\d\d)/, (_, yy) => `21${yy}`);

/**
 * The sample with points: the first listing exact, the sensitive one exact
 * (owner Q119: its published place), one approximate, the rest none.
 */
function fixture(dir: string): { events: string; opportunities: string } {
  const file = structuredClone(sample);
  const sens = file.events.find((e) => isSensitive(e))!;
  const plain = file.events.filter((e) => !isSensitive(e));
  Object.assign(plain[0], { lat: 39.97, lon: -75.13, approximate: false, listing_language: "en", machine_translations: { es: { title: "Turno de prueba en español" } } });
  Object.assign(sens, { lat: 39.95, lon: -75.16, approximate: false, address: "400 Example Plaza, Philadelphia, PA 19107" });
  // An area center for a listing that also has a street address: still no directions (pv-schema finding).
  Object.assign(plain[1], { lat: 39.96, lon: -75.2, approximate: true, address: "200 Sample Avenue, Philadelphia, PA 19104" });
  for (const e of file.events) {
    e.start = shift(e.start);
    if (e.end) e.end = shift(e.end);
  }
  const opp = structuredClone(sampleOpp);
  Object.assign(opp.opportunities[0], {
    lat: 39.98,
    lon: -75.12,
    approximate: false,
    listing_language: "en",
    commitment: "Two hours a week",
    machine_translations: { es: { title: "Paseos con perros de prueba", commitment: "Dos horas a la semana" } },
  });
  const events = join(dir, "events.json");
  const opportunities = join(dir, "opportunities.json");
  writeFileSync(events, JSON.stringify(file));
  writeFileSync(opportunities, JSON.stringify(opp));
  return { events, opportunities };
}

const text = (html: string) => decode(html.replace(/<[^>]+>/g, "")).trim();
const decode = (s: string) =>
  s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const liFor = (html: string, id: string) => html.match(new RegExp(`<li[^>]*data-id="${id}"[^>]*>`))![0];
// (data-map-translated depends on the test data's translations, not on how a listing is treated.)
const mapNames = (li: string) =>
  [...li.matchAll(/\s(data-(?:lat|lon|approx|map-[a-z]+))=/g)].map((m) => m[1]).filter((n) => n !== "data-map-translated").sort();

test("built pages: List | Map switch, the day map on home, maps with no day on Flexible and Teams, pins in the page", () => {
  const dir = buildFolder();
  try {
    const input = fixture(dir);
    const out = astroBuild(dir, { PV_EVENTS: input.events, PV_OPPORTUNITIES: input.opportunities });
    const read = (p: string) => readFileSync(join(out, p), "utf8");
    const file = JSON.parse(readFileSync(input.events, "utf8")) as EventsFile;
    const sens = file.events.find((e) => isSensitive(e))!;
    const [exact, approx, none] = file.events.filter((e) => !isSensitive(e));
    for (const code of ["en", "es"]) {
      const tr = { en: lang("en"), es: lang("es") }[code]!;
      const home = read(`${code}/index.html`);
      // The switch: hidden until the script runs; List pressed first (the list stays the main view).
      const switcher = home.match(/<div class="map-switch"[^>]*>[\s\S]*?<\/div>/)![0];
      assert.match(switcher, /\shidden/);
      assert.match(switcher, new RegExp(`aria-label="${tr.map.view_label}"`));
      assert.match(switcher, new RegExp(`aria-pressed="true" data-map-view="list"[^>]*>${tr.map.view_list}<`));
      assert.match(switcher, new RegExp(`aria-pressed="false" data-map-view="map"[^>]*>${tr.map.view_map}<`));
      // The map section starts hidden, with the skip link, the day picker and the controls.
      const section = home.match(/<section[^>]*data-map-root[^>]*>/)![0];
      assert.match(section, /\shidden/);
      assert.ok(home.indexOf("data-map-switch") < home.indexOf('id="listing-list"'), "switch above the list");
      assert.ok(home.indexOf("data-map-root") < home.indexOf('id="listing-list"'), "map above the list it shows");
      assert.ok(decode(home).includes(`>${tr.map.skip}</a>`));
      assert.ok(home.includes("data-map-prev") && home.includes("data-map-next") && home.includes('type="date" data-map-day-input'));
      assert.match(decode(home), new RegExp(`<label for="map-day-input"[^>]*>${tr.map.day.pick}</label>`));
      assert.ok(decode(home).includes(tr.map.zoom_in) && decode(home).includes(tr.map.zoom_out) && decode(home).includes(tr.map.near_me));
      assert.ok(decode(home).includes(tr.map.near_me_note));
      assert.match(home, /data-map-status role="status"/, "the day's count is announced politely");
      // The credits are in the site footer (owner, 2026-11-10), from the translation files, with both links;
      // the map itself keeps a short "© OpenStreetMap" in its corner (OSM's attribution guidelines).
      const footer = home.slice(home.indexOf("<footer"), home.indexOf("</footer>"));
      const credit = footer.slice(footer.indexOf("data-map-credits"));
      assert.ok(credit.length > 0 && home.indexOf("data-map-credits") > home.indexOf('id="listing-list"'), "credits below the listings");
      const corner = home.match(/<p class="map__corner-credit"[^>]*>[\s\S]*?<\/p>/)![0];
      assert.match(corner, /© <a href="https:\/\/www\.openstreetmap\.org\/copyright" lang="en"[^>]*>OpenStreetMap<\/a>/);
      assert.match(credit, /href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>OpenStreetMap</);
      assert.match(credit, /href="https:\/\/protomaps\.com\/"[^>]*>Protomaps</);
      assert.match(credit, new RegExp(`href="/${code}/map-data/"`));
      // The Census credit and notice (scraping-licence gate): English notice in lang="en" on every page,
      // its translation beside it on pages in other languages; on the map and on the map-data page.
      const notice = "This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.";
      for (const html of [home, read(`${code}/map-data/index.html`)]) {
        const d = decode(html);
        assert.match(d, new RegExp(`<span lang="en"[^>]*>${notice.replace(/\./g, "\\.")}</span>`), code);
        assert.match(d, /<span lang="en"[^>]*>US Census Bureau<\/span>/, code);
        if (code === "en") assert.equal(d.split(notice).length - 1, 1, "en: the notice once, not repeated");
        else assert.ok(d.includes(tr.map.census_notice_translation), `${code}: the translation beside the notice`);
        // The land-cover credit (ESA WorldCover; licence gate): English with lang="en", a translation beside it off English pages.
        const esa = "Land cover: © ESA WorldCover project 2020 / Contains modified Copernicus Sentinel data (2020) processed by ESA WorldCover consortium";
        assert.equal(tr.map.credit_esa, esa);
        assert.ok(d.includes(`<span lang="en" data-map-esa`) || d.includes(`data-map-esa`), `${code}: ESA credit marked`);
        // On screen the wording is unchanged; screen readers hear a full stop for each " / " (accessibility gate).
        const esaSpan = d.match(/<span lang="en"[^>]*>(© ESA|Land cover)[\s\S]*?consortium<\/span>/)?.[0] ?? d.slice(d.indexOf("Land cover: ©"), d.indexOf("consortium", d.indexOf("Land cover: ©")) + 10);
        assert.equal(text(esaSpan.replace(/<span class="sr-only"[^>]*>[^<]*<\/span>/g, "")).replace(/\s+/g, " "), esa, `${code}: ESA credit shows as approved`);
        assert.match(esaSpan, /<span aria-hidden="true"[^>]*> \/ <\/span><span class="sr-only"[^>]*>\. <\/span>/, `${code}: slash hidden from screen readers`);
        const visible = text(d.replace(/<span class="sr-only"[^>]*>[^<]*<\/span>/g, "")).replace(/\s+/g, " ");
        if (code !== "en") assert.ok(visible.includes(tr.map.credit_esa_translation), `${code}: ESA translation beside it`);
      }
      // The map's settings: our own worker and stylesheet; no street map in this build.
      const config = JSON.parse(decode(section.match(/data-config="([^"]*)"/)![1]));
      assert.equal(config.mode, "day");
      assert.equal(config.basemap, null);
      assert.ok(existsSync(join(out, config.worker)), config.worker);
      assert.ok(existsSync(join(out, config.css)), config.css);
      // Pins are in the page, on the cards: exact, sensitive, approximate, none.
      assert.match(liFor(home, exact.id), /data-lat="39.97" data-lon="-75.13"/);
      assert.match(liFor(home, exact.id), /data-map-address="/);
      assert.match(liFor(home, sens.id), /data-lat="39.95" data-lon="-75.16"/, "sensitive: pinned at its published place (owner Q119)");
      // Sensitive and plain cards carry exactly the same map fields (sensitive-events condition 4).
      assert.deepEqual(mapNames(liFor(home, sens.id)), mapNames(liFor(home, exact.id)));
      assert.doesNotMatch(liFor(home, sens.id), /sensitive/i);
      assert.match(liFor(home, approx.id), /data-approx="true"/);
      // An approximate area gets no directions, even when its listing has a street address (pv-schema finding):
      // its card has the "Approximate area" line and no directions line.
      const approxBlock = home.slice(home.indexOf(liFor(home, approx.id)), home.indexOf("</li>", home.indexOf(liFor(home, approx.id))));
      assert.doesNotMatch(approxBlock, /data-map-directions/);
      const exactBlock = home.slice(home.indexOf(liFor(home, exact.id)), home.indexOf("</li>", home.indexOf(liFor(home, exact.id))));
      assert.match(decode(exactBlock), new RegExp(`<p class="map-directions"[^>]*data-map-directions hidden[^>]*>[\\s\\S]*?${tr.map.directions}[\\s\\S]*?${tr.map.directions_note.replace(/\./g, "\\.")}`));
      assert.doesNotMatch(liFor(home, none.id), /data-lat/);
      // "Approximate area" in words on the list entry too, shown while the map is on.
      const approxCard = home.slice(home.indexOf(liFor(home, approx.id)), home.indexOf("</li>", home.indexOf(liFor(home, approx.id))));
      assert.match(decode(approxCard), new RegExp(`data-map-approx-line hidden[^>]*>${tr.map.approximate}</p>`));
      // Pin names: "{title}, {time}" with the time on the card.
      assert.match(liFor(home, exact.id), /data-map-time="[^"]+"/);
      // The pin's title is the one the card shows: the Spanish machine translation on /es/ (decision 0036).
      const shownTitle = code === "es" ? "Turno de prueba en español" : exact.title;
      assert.ok(decode(liFor(home, exact.id)).includes(`data-map-title="${shownTitle}"`), code);
      assert.ok(liFor(home, exact.id).includes(`data-map-lang="${code === "es" ? "es" : "en"}"`), code);
      // Flexible and Teams: their own maps, with no day picker.
      for (const [page, kind] of [["flexible", "flexible"], ["teams", "teams"]]) {
        const html = read(`${code}/${page}/index.html`);
        const cfg = JSON.parse(decode(html.match(/<section[^>]*data-map-root[^>]*data-config="([^"]*)"/)![1]));
        assert.equal(cfg.mode, "all", page);
        assert.equal(cfg.kind, kind, page);
        assert.ok(!html.includes("data-map-prev"), `${page}: no day picker`);
        assert.ok(!html.includes("data-map-status"), `${page}: the list count stays the announcement`);
        assert.ok(html.includes("data-map-switch"), page);
      }
      const flexible = read(`${code}/flexible/index.html`);
      assert.match(liFor(flexible, sampleOpp.opportunities[0].id), /data-lat="39.98"/);
      // The words the script uses are this language's.
      const words = JSON.parse(decode(section.match(/data-words="([^"]*)"/)![1]));
      assert.equal(words.clusterOther, tr.map.cluster.dated.other);
      assert.equal(words.maplibre["CooperativeGesturesHandler.MobileHelpText"], tr.map.gestures.mobile);
      assert.equal(words.maplibre["Map.Title"], tr.map.canvas);
      // Decision 0036 display (accessibility gate fixes 1-4).
      // (1) The map knows when a title is a machine translation, to say so in its details.
      // (1) A machine-translated title says so on its card; the map's flag shows only the title.
      // (3) A flexible card with translated words keeps the original one tap away, marked with its own language.
      const flexCard = flexible.slice(flexible.indexOf(liFor(flexible, sampleOpp.opportunities[0].id)));
      const disclosure = decode(flexCard.slice(0, flexCard.indexOf("</li>")));
      if (code === "es") {
        assert.match(disclosure, new RegExp(`<details[^>]*data-original-text[^>]*><summary[^>]*>${tr.listing.show_original}</summary>`));
        assert.match(disclosure, new RegExp(`Título: <span lang="en"[^>]*>${sampleOpp.opportunities[0].title}</span>`));
        assert.match(disclosure, /Tiempo que se pide: <span lang="en"[^>]*>Two hours a week<\/span>/);
      } else assert.doesNotMatch(disclosure, /data-original-text/, "en: nothing translated, no disclosure");
      // The full "may have mistakes" note, once, on pages whose translated cards link straight to the organization (licence gate, 0036).
      const notes = (html: string) => (decode(html).match(/<p id="translated-note"/g) ?? []).length;
      assert.equal(notes(flexible), code === "es" ? 1 : 0, `${code}: Flexible page note`);
      assert.equal(notes(home), code === "es" ? 1 : 0, `${code}: home page note (shown with the flexible cards)`);
      // Its own wording, naming the visible label (accessibility gate).
      if (code === "es") {
        assert.ok(decode(flexible).includes(tr.listing.translated_note_list));
        assert.ok(tr.listing.translated_note_list.includes(tr.listing.translated_automatically), "names the label word for word");
      }
      // (4) and (2) The listing page: each original with its lead-in; the calendar file says it is translated.
      const page = decode(read(`${code}/listing/${exact.id}/index.html`));
      const ics = page.match(/data-ics="([^"]*)"/)![1];
      if (code === "es") {
        assert.match(page, new RegExp(`<p class="listing__original-text"[^>]*>Título: <span lang="en"[^>]*>${exact.title}</span>`));
        assert.ok(ics.includes("SUMMARY:Turno de prueba en español"));
        assert.ok(ics.includes("Traducido automáticamente"), "the calendar file says the title is a machine translation");
        assert.ok(ics.replace(/\r\n /g, "").replace(/\\,/g, ",").includes(`Texto original: Título: ${exact.title}`), "and gives the organization's title");
      } else {
        assert.ok(!ics.includes("Translated automatically"));
      }
      // The map-data page, with no street map in this build.
      const data = read(`${code}/map-data/index.html`);
      assert.ok(decode(data).includes(tr.map_data.no_file));
      assert.match(data, /href="https:\/\/opendatacommons\.org\/licenses\/odbl\/1-0\/" lang="en"/);
      assert.match(data, /<span lang="en"[^>]*>SIL Open Font License<\/span>/);
      assert.ok(!data.includes("{ofl}"), "no raw placeholder");
      // ESA WorldCover on /map-data: the licence linked, and that Protomaps simplified the data.
      assert.match(data, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/" lang="en"[^>]*>CC BY 4\.0<\/a>/);
      assert.ok(decode(data).includes(tr.map_data.esa_simplified), `${code}: simplified note`);
    }
    // MapLibre's stylesheet is not on the page: it loads only when the map opens.
    const heads = read("en/index.html").match(/<link[^>]*stylesheet[^>]*>/g) ?? [];
    for (const l of heads) assert.ok(!l.includes("map-engine") && !l.includes("maplibre"), l);
    // The map code: no outside map, tile, font or analytics host anywhere in it.
    const assets = join(out, "_astro");
    const mapCode = readdirSync(assets)
      .filter((f) => f.startsWith("map-engine") || f.startsWith("MapView"))
      .map((f) => readFileSync(join(assets, f), "utf8"))
      .concat(readdirSync(join(out, "map")).filter((f) => /\.(mjs|css)$/.test(f)).map((f) => readFileSync(join(out, "map", f), "utf8")));
    assert.ok(mapCode.length >= 3);
    const allowed = new Set(["www.w3.org", "maplibre.org", "github.com", "wiki.openstreetmap.org", "maplibre.invalid", "maps.apple.com", "www.google.com"]);
    for (const text of mapCode) {
      for (const m of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)) assert.ok(allowed.has(m[1]), `outside host in the map code: ${m[1]}`);
      assert.doesNotMatch(text, /mapbox:\/\/|api\.mapbox\.com|protomaps\.github\.io|unpkg|jsdelivr|cdnjs|cloudflareinsights/);
    }
  } finally {
    removeFolder(dir);
  }
});

/**
 * A tiny real PMTiles v3 file, written by hand (no map data: the tiles are
 * made-up bytes), so the build can read it like a real street map piece.
 */
function tinyPmtiles(tiles: Array<{ z: number; x: number; y: number; data: Buffer }>): Buffer {
  const varint = (n: number) => {
    const out: number[] = [];
    while (n >= 0x80) {
      out.push((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    out.push(n);
    return out;
  };
  const entries = tiles.map((t) => ({ id: zxyToTileId(t.z, t.x, t.y), data: t.data })).sort((a, b) => a.id - b.id);
  let offset = 0;
  const placed = entries.map((e) => ({ ...e, offset: (offset += e.data.length) - e.data.length }));
  const dir: number[] = [...varint(placed.length)];
  let last = 0;
  for (const e of placed) dir.push(...varint(e.id - last)), (last = e.id);
  for (const _ of placed) dir.push(...varint(1));
  for (const e of placed) dir.push(...varint(e.data.length));
  placed.forEach((e, i) => dir.push(...varint(i > 0 && e.offset === placed[i - 1].offset + placed[i - 1].data.length ? 0 : e.offset + 1)));
  const root = Buffer.from(dir);
  const meta = Buffer.from("{}");
  const data = Buffer.concat(placed.map((e) => e.data));
  const h = Buffer.alloc(127);
  h.write("PMTiles", 0, "ascii");
  h.writeUInt8(3, 7);
  const u64 = (at: number, v: number) => h.writeBigUInt64LE(BigInt(v), at);
  u64(8, 127);
  u64(16, root.length);
  u64(24, 127 + root.length);
  u64(32, meta.length);
  u64(40, 0);
  u64(48, 0);
  u64(56, 127 + root.length + meta.length);
  u64(64, data.length);
  u64(72, placed.length);
  u64(80, placed.length);
  u64(88, placed.length);
  h.writeUInt8(1, 96); // clustered
  h.writeUInt8(1, 97); // directories not compressed
  h.writeUInt8(1, 98); // tiles not compressed
  h.writeUInt8(1, 99); // vector tiles
  h.writeUInt8(Math.min(...tiles.map((t) => t.z)), 100);
  h.writeUInt8(Math.max(...tiles.map((t) => t.z)), 101);
  h.writeInt32LE(-761500000, 102);
  h.writeInt32LE(394500000, 106);
  h.writeInt32LE(-743800000, 110);
  h.writeInt32LE(406100000, 114);
  return Buffer.concat([h, root, meta, data]);
}

test("a street map named by PV_BASEMAP is checked, written out as small tile files (no range requests), and listed with its ODbL notice", async () => {
  const dir = buildFolder();
  try {
    const input = fixture(dir);
    const maps = join(dir, "basemap");
    mkdirSync(maps);
    // Two made-up tiles inside the region and one outside it (never written).
    const inside = [
      { z: 0, x: 0, y: 0, data: Buffer.from("tile 0/0/0") },
      { ...tileXY(-75.16, 39.95, 10), z: 10, data: Buffer.from("tile in Philadelphia at zoom 10") },
    ];
    const outside = { ...tileXY(-80, 35, 10), z: 10, data: Buffer.from("outside the region") };
    const bytes = tinyPmtiles([...inside, outside]);
    writeFileSync(join(maps, "basemap-20261109-0.pmtiles"), bytes);
    const manifest: BasemapManifest = {
      build: "20261109",
      version: "4.15.2",
      source: "https://build.protomaps.com/20261109.pmtiles",
      cut_on: "2026-11-10",
      bbox: [-76.15, 39.45, -74.38, 40.61],
      maxzoom: 12,
      commands: ["pmtiles extract https://build.protomaps.com/20261109.pmtiles basemap-20261109-0.pmtiles --bbox=-76.15,39.45,-74.38,40.61 --minzoom=0 --maxzoom=12"],
      parts: [{ file: "basemap-20261109-0.pmtiles", minzoom: 0, maxzoom: 12, bbox: [-76.15, 39.45, -74.38, 40.61], bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }],
    };
    writeFileSync(join(maps, "basemap.json"), JSON.stringify(manifest));
    const out = astroBuild(dir, { PV_EVENTS: input.events, PV_OPPORTUNITIES: input.opportunities, PV_BASEMAP: join(maps, "basemap.json") });
    // Each tile is its own small file, gzip bytes of the tile.
    const { gunzipSync } = await import("node:zlib");
    for (const t of inside) {
      const file = join(out, `map/tiles/${t.z}/${t.x}/${t.y}.mvt`);
      assert.ok(existsSync(file), file);
      assert.deepEqual(gunzipSync(readFileSync(file)), t.data);
    }
    assert.ok(!existsSync(join(out, `map/tiles/10/${outside.x}/${outside.y}.mvt`)), "nothing outside the region");
    // The map asks for those files; the whole piece is only a download for the notice.
    const home = readFileSync(join(out, "en/index.html"), "utf8");
    const config = JSON.parse(decode(home.match(/data-config="([^"]*)"/)![1]));
    assert.equal(config.basemap.tiles, "/map/tiles/{z}/{x}/{y}.mvt");
    assert.deepEqual(config.basemap.parts, [{ minzoom: 0, maxzoom: 12, bbox: [-76.15, 39.45, -74.38, 40.61] }]);
    assert.deepEqual(readFileSync(join(out, "map/tiles/basemap-20261109-0.pmtiles")), bytes);
    for (const code of ["en", "es"]) {
      const data = decode(readFileSync(join(out, `${code}/map-data/index.html`), "utf8"));
      assert.ok(data.includes("20261109.pmtiles (4.15.2)"), "names the build");
      assert.ok(data.includes('href="/map/tiles/basemap-20261109-0.pmtiles" download'), "the file can be downloaded (ODbL 4.6)");
      assert.ok(data.includes(manifest.commands[0]), "the command is published");
    }
    // The browser never asks for a byte range, and never reads the whole piece.
    const engine = code("src/scripts/map-engine.ts");
    assert.doesNotMatch(engine, /PMTiles|Range|\.pmtiles/);
    assert.match(engine, /credentials: "omit"/);
    // A piece that does not match its SHA-256 stops the build.
    writeFileSync(join(maps, "basemap-20261109-0.pmtiles"), Buffer.concat([bytes, Buffer.from("x")]).subarray(1));
    assert.throws(
      () => astroBuild(join(dir, "again"), { PV_EVENTS: input.events, PV_BASEMAP: join(maps, "basemap.json") }),
      (err: { stderr?: Buffer }) => /SHA-256/.test(String(err.stderr ?? err)),
    );
  } finally {
    removeFolder(dir);
  }
});
