// Machine-translated listing text (decision 0036; site/src/i18n/listing-text.ts). Run from site/: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { listingText, shownListing } from "../src/i18n/listing-text.ts";

const listing = {
  listing_language: "en",
  org_name: "Sample Pantry",
  title: "Kitchen volunteer shift",
  team_task: "cook supper for 40",
  machine_translations: { es: { title: "Turno de voluntariado en la cocina" } },
};

test("a Spanish page shows the translation, marked es, with the original kept", () => {
  assert.deepEqual(listingText(listing, "title", "es"), {
    text: "Turno de voluntariado en la cocina",
    lang: "es",
    translated: true,
    original: "Kitchen volunteer shift",
    originalLang: "en",
  });
  assert.equal(shownListing(listing, "es").translated, true);
});

test("the English page, and fields with no translation, show the organization's words", () => {
  assert.equal(listingText(listing, "title", "en")!.translated, false);
  assert.equal(listingText(listing, "title", "en")!.lang, "en");
  assert.deepEqual(listingText(listing, "team_task", "es"), {
    text: "cook supper for 40",
    lang: "en",
    translated: false,
    original: "cook supper for 40",
    originalLang: "en",
  });
  assert.equal(listingText(listing, "commitment", "es"), null);
});

test("no translations at all (no key yet): the original, labeled with its language", () => {
  const plain = { ...listing, machine_translations: undefined };
  const shown = shownListing(plain, "es");
  assert.equal(shown.translated, false);
  assert.equal(shown.title.text, "Kitchen volunteer shift");
  assert.equal(shown.title.lang, "en");
});

test("a listing written in the page's language is never replaced", () => {
  const spanish = { ...listing, listing_language: "es-US", machine_translations: { es: { title: "otra cosa" } } };
  assert.equal(listingText(spanish, "title", "es")!.text, "Kitchen volunteer shift");
});
