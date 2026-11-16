// The calendar's links to the private account pages, and the public listings
// file they read (Phase 2 plan task 2.1; decisions 0033, 0047, 0017 amendment;
// PROJECT.md 3, 6, 8.1, 11.2). Pure, so tests can check it.
//
// Everything here is off while the city's settings have no accounts.url:
// no links, no sensitive-listing note and no /listings.json. The file and the
// note go live together, in the same build (sensitive-events condition 3).
import { isSensitive } from "./prepare.ts";
import { ORG_ID, SERIES_ID, placeId } from "./ids.ts";
import { localParts } from "./time.ts";
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

export { ORG_ID, SERIES_ID };

/** What a listing carries for favorites (decision 0060). Both optional: older files have neither. */
export interface FavoriteFields {
  recurring?: boolean;
  org_id?: string | null;
  series_id?: string | null;
}

/**
 * The listing's favorites ids, or null for each it lacks or that does not fit
 * the format. A series id counts only on a recurring listing (event format rule).
 */
export function favoriteIds(e: FavoriteFields): { org_id: string | null; series_id: string | null } {
  const org = typeof e.org_id === "string" && ORG_ID.test(e.org_id) ? e.org_id : null;
  const series = e.recurring === true && typeof e.series_id === "string" && SERIES_ID.test(e.series_id) ? e.series_id : null;
  return { org_id: org, series_id: series };
}

/**
 * A link to My Favorites on the account pages (decision 0060, design accepted
 * 2026-11-16). `add` saves the item; `offer` asks first ("This event is not
 * recurring. Favorite the host organization instead?"). Only the id goes, and
 * only after #, which browsers never send to a server.
 */
export function favoriteUrl(base: string, lang: string, action: "add" | "offer", kind: "series" | "host", id: string): string {
  return `${base}${langPart(lang)}/favorites/#${action}=${kind}:${id}`;
}

/** The ☆ on a dated listing's card or page. */
export interface EventFavorite {
  href: string;
  /** "series": a recurring shift, saved as itself; "one-time": the link offers the host instead. */
  kind: "series" | "one-time";
}

/**
 * The ☆ for a dated listing: a recurring one with a series id saves the series;
 * one that is not recurring offers its host (when it has a host id). A recurring
 * listing with no usable series id gets no ☆ of its own (its page still has the
 * host's). Nothing at all while accounts are off. Sensitive listings keep the ☆:
 * decision 0060 lets them be favorited, kept on the device only by the account pages.
 */
export function eventFavorite(base: string, lang: string, e: FavoriteFields): EventFavorite | null {
  if (!base) return null;
  const ids = favoriteIds(e);
  if (ids.series_id) return { href: favoriteUrl(base, lang, "add", "series", ids.series_id), kind: "series" };
  if (e.recurring !== true && ids.org_id) return { href: favoriteUrl(base, lang, "offer", "host", ids.org_id), kind: "one-time" };
  return null;
}

/**
 * The ☆ on a flexible opportunity's card (decision 0060, "Flexible and team
 * shifts"): saves the opportunity by its own id (#add=flexible:<id>). Its id
 * must fit the account pages' listing id pattern, as for "Log this shift".
 * "" when accounts are off. Sensitive ones keep the ☆, as a series does.
 */
export function flexibleFavoriteUrl(base: string, lang: string, id: string): string {
  return linkable(base, id) ? `${base}${langPart(lang)}/favorites/#add=flexible:${id}` : "";
}

/** The ☆ beside a host's name, or "" when accounts are off or the listing has no host id. */
export function hostFavoriteUrl(base: string, lang: string, e: FavoriteFields): string {
  const { org_id } = favoriteIds(e);
  return base && org_id ? favoriteUrl(base, lang, "add", "host", org_id) : "";
}

/**
 * One entry of /listings.json: exactly these thirteen fields, nothing about any
 * person. org_id and series_id are null when the listing has none; series_id
 * is always null on a flexible entry (decision 0060). place_id (decision 0063)
 * is null when the listing has no org_id or no address. start_time is the
 * start's local time of day, "HH:MM" in the settings' time zone, for the
 * volunteer time notes (decision 0062); null on a flexible entry.
 */
export interface ListingsFileEntry {
  id: string;
  title: string;
  org_name: string;
  org_id: string | null;
  series_id: string | null;
  place_id: string | null;
  start: string | null;
  start_time: string | null;
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

/** Minutes after midnight as "HH:MM" (24-hour), the shape the database's time fields take. */
export function clockText(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
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
export function listingsFile(
  file: Pick<EventsFile, "generated_at">,
  listings: PreparedListing[],
  opportunities: Opportunity[],
  timeZone: string,
): ListingsFile {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(file.generated_at)) throw new Error("listings.json: the events file's generated_at needs a time zone offset");
  const seen = new Set<string>();
  const out: ListingsFileEntry[] = [];
  const add = (e: PreparedListing | Opportunity, flexible: boolean) => {
    if (!LISTING_ID.test(e.id) || seen.has(e.id)) return;
    seen.add(e.id);
    const ids = favoriteIds(flexible ? { org_id: e.org_id } : (e as PreparedListing));
    out.push({
      id: e.id,
      title: e.title,
      org_name: e.org_name,
      org_id: ids.org_id,
      series_id: ids.series_id,
      place_id: placeId(ids.org_id, e.address),
      start: flexible ? null : (e as PreparedListing).start,
      start_time: flexible ? null : clockText(localParts((e as PreparedListing).start, timeZone).minutes),
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
