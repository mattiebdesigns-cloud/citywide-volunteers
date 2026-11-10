// Dark mode (owner, 2026-11-10; pv-design; PROJECT.md 2, 5, 14).
// The site has two colour sets in styles/tokens.css: light, and dark for
// devices set to dark mode. These tests build the site and check the built
// CSS and pages: every light colour token has a dark value, components use
// tokens only, the pages tell the browser we have our own dark colours (so
// phones such as Samsung Internet do not darken the page themselves), the
// key colour pairs pass WCAG 2.1 AA in both sets, and the map's dark style
// uses the same files as the light one.
// Run from site/: npm test.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { astroBuild, buildFolder, removeFolder } from "./build-helper.ts";
import { darkFlavor, mapStyle } from "../src/lib/map-style.ts";
import type { EventsFile } from "../src/lib/types.ts";

const site = fileURLToPath(new URL("..", import.meta.url));
const sample: EventsFile = JSON.parse(readFileSync(join(site, "../docs/examples/events.sample.json"), "utf8"));

// ---- Colour sums (WCAG 2.1 relative luminance) ----

function rgb(value: string): [number, number, number] {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  throw new Error(`not a plain colour: ${value}`);
}
function luminance(value: string): number {
  const [r, g, b] = rgb(value).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---- Reading the built CSS ----

interface Block {
  /** "@media screen and (prefers-color-scheme: dark)" or "" at the top level. */
  media: string;
  selector: string;
  body: string;
}

/** Splits CSS into rules, remembering the @media each sits in (one level deep is all the site uses). */
function rules(css: string): Block[] {
  const out: Block[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const walk = (text: string, media: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const head = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith("@media") || head.startsWith("@supports")) walk(body, head);
      else if (!head.startsWith("@")) out.push({ media, selector: head.replace(/^[^@]*;\s*/, ""), body });
      i = j;
    }
  };
  walk(clean, "");
  return out;
}

/** Custom properties declared in a rule body. */
function tokens(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) map.set(m[1], m[2].trim());
  return map;
}

const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\btransparent\b|%23[0-9a-f]{3,6}/i;
// Dark mode is the page's own setting (owner, 2026-11-10: light by default, with a switch).
const DARK_ROOT = /^:root\[data-theme=("?)dark\1\]$/;

let dir = "";
let out = "";
let css = "";
let blocks: Block[] = [];
let light = new Map<string, string>();
let dark = new Map<string, string>();
const pages: string[] = [];

before(() => {
  dir = buildFolder();
  const file = structuredClone(sample);
  for (const e of file.events) {
    e.start = e.start.replace(/^20(\d\d)/, (_, yy) => `21${yy}`);
    if (e.end) e.end = e.end.replace(/^20(\d\d)/, (_, yy) => `21${yy}`);
  }
  const events = join(dir, "events.json");
  writeFileSync(events, JSON.stringify(file));
  out = astroBuild(dir, { PV_TEST_BUILD: "1", PV_EVENTS: events });
  const cssDir = join(out, "_astro");
  css = readdirSync(cssDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(join(cssDir, f), "utf8"))
    .join("\n");
  blocks = rules(css);
  for (const b of blocks) {
    if (b.selector === ":root" && b.media === "") for (const [k, v] of tokens(b.body)) light.set(k, v);
    else if (DARK_ROOT.test(b.selector)) for (const [k, v] of tokens(b.body)) dark.set(k, v);
  }
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) pages.push(p);
    }
  };
  walk(out);
});
after(() => removeFolder(dir));

test("every light colour token has a dark value, and the dark set adds nothing the light set lacks", () => {
  const colourTokens = [...light].filter(([, v]) => COLOUR.test(v)).map(([k]) => k);
  assert.ok(colourTokens.length > 40, `found ${colourTokens.length} light colour tokens`);
  const missing = colourTokens.filter((k) => !dark.has(k));
  assert.deepEqual(missing, [], "light colour tokens with no dark value");
  const extra = [...dark.keys()].filter((k) => !light.has(k));
  assert.deepEqual(extra, [], "dark tokens with no light value");
});

test("the dark set is for screens only, so printing stays on the light set", () => {
  const media = blocks.filter((b) => DARK_ROOT.test(b.selector)).map((b) => b.media);
  assert.ok(media.length > 0);
  for (const m of media) assert.match(m, /^@media screen\b/);
});

test("components use colour tokens only: no colour written straight into a style, outside print", () => {
  const found: string[] = [];
  for (const b of blocks) {
    if (b.selector === ":root" || DARK_ROOT.test(b.selector)) continue;
    if (/\bprint\b|forced-colors/.test(b.media)) continue;
    // Strip custom-property fallbacks such as var(--x, #fff): the token wins whenever the site's CSS loads.
    const body = b.body.replace(/var\(--[\w-]+\s*,\s*[^()]*(\([^()]*\))?[^()]*\)/g, "var()");
    // "transparent" (written #0000 by the build) is the same in both modes.
    const plain = body.replace(/#0000(0000)?\b/g, "transparent");
    const hit = plain.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?<![\w-])(white|black)(?![\w-])/i);
    if (hit) found.push(`${b.selector} { ${hit[0]} }`);
  }
  assert.deepEqual(found, []);
});

test("pages are light by default, say we have our own dark colours, and apply a saved Dark mode before the first paint", () => {
  // Light for everyone unless the person turns on Dark mode (owner, 2026-11-10).
  assert.match(css, /html\s*{[^}]*color-scheme:\s*light\s*[;}]/);
  assert.match(css, /html\[data-theme=("?)dark\1\]\s*{[^}]*color-scheme:\s*dark/);
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/, "the device setting no longer switches the colours");
  assert.ok(pages.length >= 10, `${pages.length} pages`);
  for (const p of pages) {
    const html = readFileSync(p, "utf8");
    if (!html.includes("<head>")) continue;
    assert.match(html, /<meta name="color-scheme" content="light dark"\s*\/?>/, p.slice(out.length));
    // Pages built on the site's layout (the root language page and 404 have their own frame).
    if (!html.includes('class="site-header"')) continue;
    assert.match(html, /<html[^>]*data-theme="light"/, p.slice(out.length));
    if (!p.includes("medicaid-hours")) {
      // The saved choice is read before any stylesheet, so the page never flashes.
      const head = html.slice(0, html.indexOf("</head>"));
      const script = head.indexOf('localStorage.getItem("cvh.theme")');
      assert.ok(script > 0 && script < (head.indexOf("<link rel=\"stylesheet\"") + 1 || Infinity), p.slice(out.length));
    }
  }
});

test("header logo: the lettering follows the tokens, so dark mode shows white and coral", () => {
  const html = readFileSync(join(out, "en/index.html"), "utf8");
  assert.match(html, /fill:var\(--logo-philly,#1f4e8c\)/);
  assert.match(html, /fill:var\(--logo-volunteers,#a8432b\)/);
  assert.equal(dark.get("--logo-philly"), "#ffffff");
  assert.equal(dark.get("--logo-volunteers"), "#f08a6c");
});

test("test-version notice: the 🚧 sign (owner, 2026-11-10), hidden from screen readers; text 3:1 or more in both modes", () => {
  const html = readFileSync(join(out, "en/index.html"), "utf8");
  const banner = html.match(/<div class="test-banner[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(banner, "banner present in a test build");
  assert.match(banner[1], /<span class="test-banner__icon"[^>]*aria-hidden="true"[^>]*>🚧<\/span>/);
  assert.doesNotMatch(banner[1], /#icon-hard-hat/, "the drawn hard hat is no longer used (owner)");
  assert.doesNotMatch(banner[1], /#icon-info/);
  for (const set of [light, dark]) assert.ok(contrast(set.get("--color-ink")!, set.get("--color-notice-bg")!) >= 3);
});

// Pairs that carry text (4.5:1) or a needed edge, shape or focus ring (3:1).
const PAIRS: Array<[string, string, number]> = [
  ["--color-ink", "--color-paper", 4.5],
  ["--color-ink", "--color-surface", 4.5],
  ["--color-ink-muted", "--color-paper", 4.5],
  ["--color-ink-muted", "--color-surface", 4.5],
  ["--color-line", "--color-paper", 3],
  ["--color-line", "--color-surface", 3],
  ["--color-primary", "--color-paper", 4.5],
  ["--color-primary", "--color-surface", 4.5],
  ["--color-on-primary", "--color-primary", 4.5],
  ["--color-primary-hover", "--color-paper", 4.5],
  ["--color-on-primary", "--color-primary-hover", 4.5],
  ["--color-on-accent", "--color-accent", 4.5],
  ["--color-on-band", "--color-band", 4.5],
  ["--color-on-band-muted", "--color-band", 4.5],
  ["--color-accent", "--color-band", 3],
  ["--color-full-text", "--color-full-bg", 4.5],
  ["--color-spots-text", "--color-spots-bg", 4.5],
  ["--color-ink", "--color-notice-bg", 4.5],
  ["--color-notice-border", "--color-notice-bg", 3],
  ["--color-focus", "--color-paper", 3],
  ["--color-focus", "--color-surface", 3],
  ["--color-focus-inner", "--color-focus", 3],
  ["--color-focus-on-dark", "--color-band", 3],
  ["--logo-philly", "--color-paper", 4.5],
  ["--logo-volunteers", "--color-paper", 4.5],
  ["--map-pin-edge", "--map-earth", 3],
  ["--color-primary", "--map-pin-ring", 3],
  ["--art-fill", "--art-youth", 3],
  ["--art-line", "--art-youth", 3],
];

for (const [name, set] of [
  ["light", () => light],
  ["dark", () => dark],
] as const) {
  test(`${name} set: text 4.5:1 and shapes, edges and focus 3:1`, () => {
    const s = set();
    const low: string[] = [];
    for (const [fg, bg, need] of PAIRS) {
      const r = contrast(s.get(fg)!, s.get(bg)!);
      if (r < need) low.push(`${fg} on ${bg}: ${r.toFixed(2)} < ${need}`);
    }
    assert.deepEqual(low, []);
  });
}

test("dark set: About drawings sit on a tile that keeps navy 3:1 and the cause tiles keep navy 3:1", () => {
  assert.ok(contrast(dark.get("--art-fill")!, dark.get("--art-backdrop")!) >= 3);
  assert.equal(light.get("--art-backdrop"), "transparent");
  for (const [k, v] of dark) {
    if (!k.startsWith("--art-") || ["--art-line", "--art-fill", "--art-fill-2", "--art-fill-3", "--art-tint", "--art-tint-2", "--art-water", "--art-backdrop"].includes(k)) continue;
    assert.ok(contrast(dark.get("--art-fill")!, v) >= 3, `${k}`);
  }
});

test("map: the dark style uses the same street map, letters and road signs, and its labels are 4.5:1 on their halos", () => {
  const opts = { lang: "en", origin: "https://example.org", maxzoom: 15 };
  const l = mapStyle({ ...opts, dark: false });
  const d = mapStyle({ ...opts, dark: true });
  assert.equal(d.glyphs, l.glyphs);
  assert.equal(d.sprite, l.sprite);
  assert.deepEqual(d.sources, l.sources);
  const bg = (s: typeof d) => (s.layers.find((x) => x.id === "background") as unknown as { paint: Record<string, string> }).paint["background-color"];
  assert.notEqual(bg(d), bg(l));
  // No address anywhere in the dark style that the light style lacks.
  const urls = (s: object) => new Set(JSON.stringify(s).match(/[a-z]+:\/\/[^"]+/g) ?? []);
  for (const u of urls(d)) assert.ok(urls(l).has(u), u);
  const f = darkFlavor();
  const pairs: Array<[string, string]> = [
    [f.roads_label_minor, f.roads_label_minor_halo],
    [f.roads_label_major, f.roads_label_major_halo],
    [f.address_label, f.address_label_halo],
    [f.subplace_label, f.subplace_label_halo],
    [f.city_label, f.city_label_halo],
    [f.state_label, f.state_label_halo],
    [f.country_label, f.state_label_halo],
    [f.ocean_label, f.earth],
  ];
  for (const [fg, bgc] of pairs) assert.ok(contrast(fg, bgc) >= 4.5, `${fg} on ${bgc}`);
  // The map's land colour behind the map matches the token, so loading shows no flash.
  assert.equal(dark.get("--map-earth"), f.earth);
});
