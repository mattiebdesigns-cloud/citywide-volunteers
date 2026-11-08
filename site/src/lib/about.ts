// About page (decision 0025): figures worked out from the build's own data,
// never typed in. Pure, so tests can check them.
import type { Opportunity, PreparedListing } from "./types.ts";

export interface AboutCounts {
  /** Calendar listings plus flexible opportunities in this build. */
  listings: number;
  /** Different organizations, by name, ignoring case and extra spaces. */
  organizations: number;
  /** Different neighborhoods or towns named in the listings. */
  neighborhoods: number;
}

const key = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");

export function aboutCounts(listings: PreparedListing[], opportunities: Opportunity[]): AboutCounts {
  const all = [...listings, ...opportunities];
  const organizations = new Set(all.map((e) => key(e.org_name)).filter(Boolean));
  const neighborhoods = new Set(all.map((e) => key(e.neighborhood_or_town)).filter(Boolean));
  return { listings: all.length, organizations: organizations.size, neighborhoods: neighborhoods.size };
}

/** The nine drawings the page needs, in section order. */
export const ABOUT_SECTIONS = ["shifts", "near-you", "everyone", "private", "more", "rewards", "why", "support", "contact"] as const;
export type AboutSection = (typeof ABOUT_SECTIONS)[number];
