// The place key for published tips (decision 0063; recipe in docs/EVENT-FORMAT.md,
// "place_id: worked out by the site, not in events.json", and schema/listing_ids.py,
// private repo; tests/ids.test.ts pins this file to that page). Worked out at build time for
// /listings.json and the tips section. Build time only (uses node:crypto).
// Nothing here is city-specific (rule 14).
import { createHash } from "node:crypto";

/** The event format's ids (docs/event.schema.json); anything else is treated as none. */
export const ORG_ID = /^o-[0-9a-f]{16}$/;
export const SERIES_ID = /^s-[0-9a-f]{16}$/;
export const PLACE_ID = /^p-[0-9a-f]{16}$/;

/** Python's str.casefold() differs from toLowerCase() on Latin text only for these. */
const CASEFOLD: Record<string, string> = { ß: "ss", ẞ: "ss", ſ: "s" };

/** Name steps 1-3 and 5: NFKD, no accents, case-fold, "&" as "and", runs of non [a-z0-9] as one space. */
export function addressNorm(address: string | null | undefined): string {
  const text = String(address ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßẞſ]/g, (c) => CASEFOLD[c]);
  return text.replaceAll("&", " and ").split(/[^0-9a-z]+/).filter(Boolean).join(" ");
}

/** "p-" + first 16 hex of SHA-256("place" 0x1F org_id 0x1F normalized address); null when either is missing. */
export function placeId(orgId: string | null | undefined, address: string | null | undefined): string | null {
  const norm = addressNorm(address);
  if (!orgId || !ORG_ID.test(orgId) || !norm) return null;
  return `p-${createHash("sha256").update(["place", orgId, norm].join("\x1f"), "utf8").digest("hex").slice(0, 16)}`;
}
