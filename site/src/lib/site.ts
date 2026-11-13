// Build-time inputs for every page: settings, listings, language helpers.
// Read once per build. Paths come from astro.config.mjs (PV_EVENTS, PV_SETTINGS).
import { existsSync, readFileSync } from "node:fs";
import { createI18n, type I18n, type Translator } from "../i18n/index.ts";
import { catalogs } from "../i18n/locales.ts";
import { checkEventsFile, checkOpportunitiesFile, checkSettings, prepareListings, prepareOpportunities } from "./prepare.ts";
import type { EventsFile, OpportunitiesFile, Opportunity, PreparedListing, SiteSettings } from "./types.ts";
import { checkManifest, type BasemapManifest } from "./map.ts";
import { readTotals, type AboutTotals } from "./about.ts";

export interface SiteData {
  settings: SiteSettings;
  i18n: I18n;
  listings: PreparedListing[];
  /** Flexible opportunities (decision 0018); empty when there is no file. */
  opportunities: Opportunity[];
  generatedAt: string;
  builtAt: Date;
  testBuild: boolean;
  /** The site's public address with no trailing slash, or "" when not set. */
  siteUrl: string;
  /** The About page's running totals (owner, 2026-11-10), or null when PV_STATS is not set. */
  totals: AboutTotals | null;
  /** The street map under the map pins (decision 0035), or null when PV_BASEMAP is not set. */
  basemap: BasemapManifest | null;
}

let cached: SiteData | undefined;

function readJson<T>(path: string, what: string): T {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Cannot read the ${what} at ${path}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`The ${what} at ${path} is not valid JSON`);
  }
}

export function siteData(): SiteData {
  if (cached) return cached;
  const settingsPath = process.env.PV_SETTINGS_PATH;
  const eventsPath = process.env.PV_EVENTS_PATH;
  if (!settingsPath || !eventsPath) throw new Error("Build the site with astro.config.mjs (npm run build)");

  const settings = readJson<SiteSettings>(settingsPath, "settings file");
  checkSettings(settings, settingsPath);
  const file = readJson<EventsFile>(eventsPath, "events file");
  checkEventsFile(file, eventsPath);

  // Optional. A path the builder named must exist; the default sample may not.
  const oppPath = process.env.PV_OPPORTUNITIES_PATH;
  let opportunities: Opportunity[] = [];
  if (oppPath && (process.env.PV_OPPORTUNITIES_REQUIRED === "1" || existsSync(oppPath))) {
    const opp = readJson<OpportunitiesFile>(oppPath, "opportunities file");
    checkOpportunitiesFile(opp, oppPath);
    opportunities = prepareOpportunities(opp, settings);
  }

  // Optional street map (decision 0035). The files themselves are checked and copied by scripts/astro-map-files.mjs.
  const basemapPath = process.env.PV_BASEMAP_PATH;
  let basemap: BasemapManifest | null = null;
  if (basemapPath) {
    basemap = readJson<BasemapManifest>(basemapPath, "street map description (basemap.json)");
    checkManifest(basemap, basemapPath);
  }

  // Optional running totals for the About page. A path the builder named must exist.
  const statsPath = process.env.PV_STATS_PATH;
  const totals = statsPath ? readTotals(readJson<unknown>(statsPath, "totals file"), statsPath) : null;

  const builtAt = new Date();
  cached = {
    totals,
    basemap,
    settings,
    i18n: createI18n(settings, catalogs),
    listings: prepareListings(file, settings, { now: builtAt }),
    opportunities,
    generatedAt: file.generated_at,
    builtAt,
    testBuild: process.env.PV_TEST_BUILD === "1" || process.env.PV_TEST_BUILD === "true",
    siteUrl: (process.env.PV_SITE_URL ?? "").replace(/\/+$/, ""),
  };
  return cached;
}

/** Static paths for one page per language. */
export function languagePaths() {
  return siteData().i18n.languages.map((lang) => ({ params: { lang } }));
}

export function translator(lang: string): Translator {
  return siteData().i18n.translator(lang);
}

/** Page addresses. One place, so the language switch and links agree. */
export const paths = {
  home: (lang: string) => `/${lang}/`,
  listing: (lang: string, id: string) => `/${lang}/listing/${id}/`,
  flexible: (lang: string) => `/${lang}/flexible/`,
  teams: (lang: string) => `/${lang}/teams/`,
  about: (lang: string) => `/${lang}/about/`,
  medicaid: (lang: string) => `/${lang}/medicaid-hours/`,
  mapData: (lang: string) => `/${lang}/map-data/`,
  progress: (lang: string) => `/${lang}/progress/`,
  mlk: (lang: string) => `/${lang}/mlk-day/`,
  contact: (lang: string) => `/${lang}/contact/`,
  /** The home page with its map open (MAP_HASH in lib/map.ts): a fixed address, nothing else in it. */
  homeMap: (lang: string) => `/${lang}/#map`,
};
