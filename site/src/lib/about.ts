// About page (decision 0025): its drawings, and the running totals read from
// the totals file (owner, 2026-11-10), never typed in. Pure, so tests can check them.

/** The nine drawings the page needs, in section order. */
export const ABOUT_SECTIONS = ["shifts", "near-you", "everyone", "private", "more", "rewards", "why", "support", "contact"] as const;
export type AboutSection = (typeof ABOUT_SECTIONS)[number];

/** The About page's running totals (owner, 2026-11-10): numbers only, from the totals file. */
export interface AboutTotals {
  /** Dated shifts plus flexible cards ever listed. */
  opportunities: number;
  organizations: number;
  neighborhoods: number;
}

/**
 * Reads the totals from the running totals file (metrics/listings-ledger.json,
 * version 4 or later: {"totals": {"shifts", "cards", "organizations",
 * "neighborhoods"}}). Only those four whole numbers are read; the file's note
 * and anything else in it never reach the page. Throws a plain message when a
 * number is missing or not a whole number, so a broken file never shows wrong figures.
 */
export function readTotals(file: unknown, source: string): AboutTotals {
  const totals = (file as { totals?: Record<string, unknown> } | null)?.totals;
  const whole = (name: string): number => {
    const v = totals?.[name];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      throw new Error(`The totals file ${source} needs a whole number at totals.${name}`);
    }
    return v;
  };
  return {
    opportunities: whole("shifts") + whole("cards"),
    organizations: whole("organizations"),
    neighborhoods: whole("neighborhoods"),
  };
}
