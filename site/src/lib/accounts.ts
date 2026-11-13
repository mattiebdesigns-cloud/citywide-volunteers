// The calendar's links to the private account pages, and the public listings
// file they read (Phase 2 plan task 2.1; decisions 0033, 0047, 0017 amendment;
// PROJECT.md 3, 6, 8.1, 11.2). Pure, so tests can check it.
//
// Everything here is off while the city's settings have no accounts.url:
// no links, no sensitive-listing note and no /listings.json. The file and the
// note go live together, in the same build (sensitive-events condition 3).
import { isSensitive } from "./prepare.ts";
import type { EventsFile, Opportunity, PreparedListing, SiteSettings } from "./types.ts";

/** The account pages' id pattern (web/README.md, private): links and the file use only ids that match. */
export const LISTING_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * The account pages' address, such as https://my.phillyvolunteers.org, or ""
 * when accounts are off. https, no path, no trailing slash (decision 0033).
 */
export function accountsUrl(settings: Pick<SiteSettings, "accounts">): string {
  const url = (settings.accounts?.url ?? "").trim();
  if (!url) return "";
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(url)) {
    throw new Error(`settings accounts.url "${url}" must be an https:// address with no path or trailing slash, or empty`);
  }
  return url;
}

/** The language part of an account page's path: none for English, "/es" for Spanish. */
const langPart = (lang: string) => (lang === "en" ? "" : `/${lang}`);

/** "Log this shift": the id goes after #, which browsers never send to a server. */
export function logUrl(base: string, lang: string, id: string): string {
  return `${base}${langPart(lang)}/log/#listing=${id}`;
}

/** "Report a safety concern": same rules as the log link. */
export function reportUrl(base: string, lang: string, id: string): string {
  return `${base}${langPart(lang)}/report/#listing=${id}`;
}

/** "Weekly email": the sign-up page; the calendar has no form and sends nothing. */
export function weeklyUrl(base: string, lang: string): string {
  return `${base}${langPart(lang)}/weekly/`;
}

/** One entry of /listings.json: exactly these nine fields, nothing about any person. */
export interface ListingsFileEntry {
  id: string;
  title: string;
  org_name: string;
  start: string | null;
  end: string | null;
  area: string;
  sensitive: boolean;
  flexible: boolean;
  listing_language: string;
}

export interface ListingsFile {
  generated_at: string;
  listings: ListingsFileEntry[];
}

const MAX_LISTINGS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The public listings file (web/README.md contract, private repo): every
 * listing the calendar shows, dated and flexible, sensitive ones included, with
 * only facts the listing pages already show. `sensitive` is isSensitive(), the
 * same value the page's sensitive note uses (sensitive-events condition 1),
 * never decision 0017's wider set of an organization's history (condition 2).
 * An id that does not match the account pages' pattern, or is already in the
 * file, is left out (and gets no "Log this shift" link either).
 */
export function listingsFile(file: Pick<EventsFile, "generated_at">, listings: PreparedListing[], opportunities: Opportunity[]): ListingsFile {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(file.generated_at)) throw new Error("listings.json: the events file's generated_at needs a time zone offset");
  const seen = new Set<string>();
  const out: ListingsFileEntry[] = [];
  const add = (e: PreparedListing | Opportunity, flexible: boolean) => {
    if (!LISTING_ID.test(e.id) || seen.has(e.id)) return;
    seen.add(e.id);
    out.push({
      id: e.id,
      title: e.title,
      org_name: e.org_name,
      start: flexible ? null : (e as PreparedListing).start,
      end: flexible ? null : ((e as PreparedListing).end ?? null),
      area: e.area,
      sensitive: isSensitive(e),
      flexible,
      listing_language: e.listing_language,
    });
  };
  for (const e of listings) add(e, false);
  for (const o of opportunities) add(o, true);
  if (out.length > MAX_LISTINGS) throw new Error(`listings.json would hold ${out.length} listings, over the ${MAX_LISTINGS} the account pages accept`);
  const result = { generated_at: file.generated_at, listings: out };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw new Error("listings.json would be over 5 MB, more than the account pages accept");
  return result;
}

/** True when this listing gets account links: accounts are on and its id fits the pattern. */
export function linkable(base: string, id: string): boolean {
  return base !== "" && LISTING_ID.test(id);
}
