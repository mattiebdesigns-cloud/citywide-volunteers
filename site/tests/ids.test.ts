// place_id (decision 0063; PROJECT.md 2 and 4). Pins src/lib/ids.ts to the
// recipe in docs/EVENT-FORMAT.md, "place_id: worked out by the site, not in
// events.json", the way tests/test_ids.py pins org_id and series_id. The fixed
// values below come from the reference copy the account database is built to,
// so the site and the database agree on every key.
// Run from site/: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PLACE_ID, addressNorm, placeId } from "../src/lib/ids.ts";

const page = readFileSync(fileURLToPath(new URL("../../docs/EVENT-FORMAT.md", import.meta.url)), "utf8");
const ORG = "o-d9f7d59f856ee361"; // org_id of "The Example Garden, Inc." (format page recipe)
const EXAMPLE = "The Café & Garden, 12 Main St.";

const sha16 = (...parts: string[]) => createHash("sha256").update(parts.join("\x1f"), "utf8").digest("hex").slice(0, 16);

test("the format page has a place_id section saying the site works it out", () => {
  assert.match(page, /^### place_id: worked out by the site, not in events\.json$/m);
  assert.ok(page.includes("It is **not a field in events.json**"));
  assert.ok(page.includes("scrapers never write it"));
});

test("the format page's address example matches addressNorm", () => {
  const m = page.match(/For example "([^"]+)" becomes `([^`]+)`\.\n\n\*\*place_id\*\*/);
  assert.ok(m, "the address example sits just before the place_id recipe");
  assert.equal(m[1], EXAMPLE);
  assert.equal(addressNorm(m[1]), m[2]);
});

test("the format page's recipe is the one ids.ts follows", () => {
  const recipe =
    "**place_id** = `p-` + the first 16 hex characters (lowercase) of SHA-256 over the UTF-8 text `place`, the byte 0x1F, the listing's whole `org_id` (with its `o-`), the byte 0x1F, and the normalized address.";
  assert.ok(page.includes(recipe));
  const norm = addressNorm(EXAMPLE);
  assert.equal(placeId(ORG, EXAMPLE), `p-${sha16("place", ORG, norm)}`);
});

test("place ids match the reference values the account database uses", () => {
  assert.equal(placeId(ORG, EXAMPLE), "p-3264a04af1c19b93");
  assert.equal(addressNorm("Straße 5"), "strasse 5"); // Python's casefold
  assert.equal(placeId(ORG, "Straße 5"), "p-3f46e4c969b7309c");
  assert.match(placeId(ORG, EXAMPLE)!, PLACE_ID);
});

test("the same place in other spellings gets the same id; nothing to build from gives null", () => {
  const id = placeId(ORG, EXAMPLE);
  assert.equal(placeId(ORG, "  THE CAFE and Garden 12 main st  "), id);
  assert.notEqual(placeId(ORG, "Cafe & Garden, 12 Main St."), id); // "the" is kept for addresses
  assert.notEqual(placeId("o-0000000000000000", EXAMPLE), id);
  assert.equal(placeId(null, EXAMPLE), null);
  assert.equal(placeId("not-an-org-id", EXAMPLE), null);
  assert.equal(placeId(ORG, ""), null);
  assert.equal(placeId(ORG, "!!!"), null);
  assert.equal(placeId(ORG, null), null);
});
