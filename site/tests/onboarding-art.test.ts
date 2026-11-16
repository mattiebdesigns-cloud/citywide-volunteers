// The onboarding drawings (decision 0064 and its amendment; PROJECT.md 2, 5, 6).
// Run from site/: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { art as causeArt } from "../src/components/ui/causeArt.ts";
import {
  allSetArtId,
  allSetIds,
  onboardingArt,
  onboardingIds,
  onboardingSvg,
  onboardingTile,
} from "../src/components/ui/onboardingArt.ts";

const ALLOWED = new Set(["a", "b", "c", "l", "cl", "w", "s"]);
const NEEDED = [
  "outdoors",
  "indoors",
  "on-your-feet",
  "sitting",
  "set-time",
  "flexible",
  "come-solo",
  "bring-group",
  "kitchen",
  "welcome",
  "recommended",
  "filters",
  "privacy",
  "all-set-love",
  "all-set-default",
];
// The cause sides of the ten interest cards (decision 0064) reuse causeArt.ts.
const CARD_CAUSES = ["education", "food", "elders", "youth", "animals", "parks-and-trees", "housing", "health", "arts", "repair", "clothing"];

test("onboarding art: every drawing is there, and nothing extra", () => {
  assert.deepEqual([...onboardingIds].sort(), [...NEEDED].sort());
  assert.deepEqual(Object.keys(onboardingArt).sort(), [...NEEDED].sort());
  assert.deepEqual(Object.keys(onboardingTile).sort(), [...NEEDED].sort());
  for (const id of NEEDED) assert.ok(onboardingArt[id as keyof typeof onboardingArt].trim().length > 50, id);
  for (const cause of CARD_CAUSES) assert.ok(causeArt[cause], `causeArt has ${cause}`);
});

test("onboarding art: only the drawing classes, colours from the tokens, no outside parts", () => {
  for (const [id, body] of Object.entries(onboardingArt)) {
    const classes = [...body.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(classes.length > 0, id);
    for (const c of classes) assert.ok(ALLOWED.has(c), `${id}: class "${c}" is not allowed`);
    // Colours come only from the classes, so a city restyles them in tokens.css.
    assert.doesNotMatch(body, /\s(fill|stroke|style|color)=/, `${id}: colour written in`);
    assert.doesNotMatch(body, /#[0-9a-f]{3,6}\b/i, `${id}: colour written in`);
    // Never a photo or an outside image, no words as text, no scripts or links.
    assert.doesNotMatch(body, /<(image|img|text|script|foreignObject|a|use|style)\b/i, id);
    assert.doesNotMatch(body, /href|url\(|data:|https?:/i, id);
    assert.doesNotMatch(body, /\$\{|undefined|NaN/, `${id}: a helper left a gap`);
    // Tags balance (a quick check that the string is well formed).
    const opens = (body.match(/<(g|svg)\b[^>]*[^/]>/g) ?? []).length;
    const closes = (body.match(/<\/(g|svg)>/g) ?? []).length;
    assert.equal(opens, closes, `${id}: unbalanced <g>`);
  }
});

// Coral on a pale tile is under 3:1 (1.2:1 in dark mode), so every coral shape
// that carries the picture repeats as an ink outline: the same tag with the same
// shape, class "l" (accessibility gate, 2026-11-16). Small accents are left out.
const OUTLINED: Record<string, number> = {
  indoors: 3, // two curtains and the lamp shade
  "on-your-feet": 1, // the box being lifted
  flexible: 1, // the coral calendar card
  "come-solo": 2, // the two coral people
  "bring-group": 3, // the two coral people and the flag
  recommended: 3, // the stars on the list and the big star
  filters: 1, // the map pin
  kitchen: 2, // the pot lid and the spatula
  welcome: 1, // the open door
  food: 3, // causeArt.ts, also on the calendar cards: the rim and the two palms (thumbs have an open outline)
};
const shape = (tag: string): string => tag.replace(/\s+class="[^"]*"/, "");

test("onboarding art: coral shapes that carry the picture have an ink outline", () => {
  for (const [id, want] of Object.entries(OUTLINED)) {
    const body = onboardingArt[id as keyof typeof onboardingArt] ?? causeArt[id];
    const tags = [...body.matchAll(/<(?:path|rect|circle|ellipse|g)\b[^>]*>/g)].map((m) => m[0]);
    const coral = tags.filter((t) => /class="b"/.test(t)).map(shape);
    const lines = new Set(tags.filter((t) => /class="l"/.test(t)).map(shape));
    const outlined = coral.filter((t) => lines.has(t)).length;
    assert.ok(outlined >= want, `${id}: ${outlined} outlined coral shapes, want ${want}`);
  }
});

test("onboarding art: whole drawings are decorative, on their tile, with inline colours", () => {
  for (const id of [...NEEDED, ...CARD_CAUSES]) {
    const svg = onboardingSvg(id);
    assert.match(svg, /^<svg [^>]*aria-hidden="true"[^>]*focusable="false"/, id);
    assert.match(svg, /viewBox="0 0 320 150"/, id);
    assert.match(svg, /<rect width="320" height="150" style="fill:var\(--art-[a-z-]+,#[0-9a-f]{6}\)"\/>/, `${id}: tile`);
    assert.doesNotMatch(svg, /class="(a|b|c|l|cl|w|s)"/, `${id}: every class painted`);
    assert.doesNotMatch(svg, /<(title|desc)\b/, `${id}: nothing for a screen reader to read`);
  }
  assert.equal(onboardingSvg("no-such-id"), "");
});

test("onboarding art: a city's All set! drawing comes from its setting, with a plain default", () => {
  assert.deepEqual([...allSetIds].sort(), ["all-set-default", "all-set-love"]);
  assert.equal(allSetArtId("all-set-love"), "all-set-love");
  assert.equal(allSetArtId(""), "all-set-default");
  assert.equal(allSetArtId(null), "all-set-default");
  assert.equal(allSetArtId(undefined), "all-set-default");
  assert.equal(allSetArtId("outdoors"), "all-set-default", "only an All set! drawing");
  assert.equal(allSetArtId("unknown"), "all-set-default");
});
