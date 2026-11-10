// Tests for the site's logic (PROJECT.md 2, 4, 8). Run from site/: npm test
// Node runs TypeScript directly (Node 22.18+ / 24).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addDays, localParts, timeOfDay } from "../src/lib/time.ts";
import {
  checkOpportunitiesFile,
  checkSettings,
  liveAreas,
  prepareListings,
  prepareOpportunities,
  spotsStatus,
  usedIds,
} from "../src/lib/prepare.ts";
import {
  EMPTY_FILTERS,
  EMPTY_FLEXIBLE_FILTERS,
  activeCount,
  flexibleActiveCount,
  flexibleMatches,
  matches,
  type CardFacts,
} from "../src/lib/filter-logic.ts";
import { buildIcs, escapeText, foldLine } from "../src/lib/ics.ts";
import { pruneSaved } from "../src/lib/saved.ts";
import { readTotals } from "../src/lib/about.ts";
import { normalizeSearch, searchMatches } from "../src/lib/search.ts";
import { SHARE_TARGETS, STORY_SAFE_BOTTOM, STORY_SAFE_TOP, fitText, placePicture, shareLinks, wrapLines } from "../src/lib/share.ts";
import { createI18n } from "../src/i18n/index.ts";
import { placeSpoken, placeText, sectionName, whereLines } from "../src/lib/words.ts";
import type { EventsFile, OpportunitiesFile, PreparedListing, SiteSettings } from "../src/lib/types.ts";

const settings: SiteSettings = JSON.parse(readFileSync(new URL("../settings.example.json", import.meta.url), "utf8"));
const sample: EventsFile = JSON.parse(
  readFileSync(new URL("../../docs/examples/events.sample.json", import.meta.url), "utf8"),
);
const hours = settings.time_of_day;
const before = new Date("2026-10-01T00:00:00Z");

test("time of day uses the city's own hours", () => {
  assert.equal(timeOfDay(4 * 60 + 59, hours), "overnight");
  assert.equal(timeOfDay(5 * 60, hours), "morning");
  assert.equal(timeOfDay(12 * 60, hours), "afternoon");
  assert.equal(timeOfDay(17 * 60 + 30, hours), "evening");
  assert.equal(timeOfDay(22 * 60, hours), "overnight");
  assert.throws(() => timeOfDay(0, { ...hours, evening: "11:00" }));
});

test("local date is in the city's time zone, not UTC", () => {
  // 02:30 UTC on Oct 21 is 22:30 on Oct 20 in New York.
  const p = localParts("2026-10-21T02:30:00Z", "America/New_York");
  assert.equal(p.date, "2026-10-20");
  assert.equal(p.weekday, 2);
  assert.equal(p.minutes, 22 * 60 + 30);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("sample settings pass the settings check; a broken one fails plainly", () => {
  checkSettings(settings, "example");
  const broken = structuredClone(settings) as unknown as Record<string, any>;
  delete broken.features;
  assert.throws(() => checkSettings(broken as SiteSettings, "broken"), /features.campaigns/);
});

test("listings are sorted soonest first and past ones are dropped", () => {
  const all = prepareListings(sample, settings, { now: before });
  assert.equal(all.length, sample.events.length);
  assert.deepEqual(
    all.map((e) => e.start),
    [...all.map((e) => e.start)].sort((a, b) => Date.parse(a) - Date.parse(b)),
  );
  const later = prepareListings(sample, settings, { now: new Date("2026-10-25T00:00:00Z") });
  assert.ok(later.every((e) => Date.parse(e.end ?? e.start) >= Date.parse("2026-10-25T00:00:00Z")));
});

test("features.campaigns off leaves no campaign listing in the build (PROJECT.md 8)", () => {
  const withCampaign: EventsFile = {
    ...sample,
    events: [...sample.events, { ...sample.events[0], id: "campaign1", type: "campaign" }],
  };
  const on = prepareListings(withCampaign, settings, { now: before });
  assert.ok(on.some((e) => e.type === "campaign"));
  const off = prepareListings(withCampaign, { ...settings, features: { campaigns: false } }, { now: before });
  assert.ok(off.every((e) => e.type !== "campaign"));
});

test("protest_action is always treated as sensitive", () => {
  const file: EventsFile = { ...sample, events: [{ ...sample.events[0], type: "protest_action", sensitive: false }] };
  assert.equal(prepareListings(file, settings, { now: before })[0].sensitive, true);
});

test("only live areas go in the area filter (PROJECT.md 4)", () => {
  assert.deepEqual(liveAreas(settings), ["philadelphia"]);
  assert.deepEqual(usedIds(["a", "b", "c"], ["c", null, "a", "a"]), ["a", "c"]);
});

test("open spots: full, count, or nothing; never a guess (decisions 0008, 0011)", () => {
  const built = new Date("2026-10-13T12:00:00Z");
  const base = { last_seen_at: "2026-10-13T05:00:00-04:00" };
  assert.deepEqual(spotsStatus({ ...base, full: true, spots_left: null }, built), { kind: "full" });
  assert.deepEqual(spotsStatus({ ...base, full: false, spots_left: 0 }, built), { kind: "full" });
  assert.deepEqual(spotsStatus({ ...base, full: false, spots_left: 6 }, built), { kind: "spots", count: 6, withinWeek: true });
  assert.equal(spotsStatus({ ...base, full: false, spots_left: 6 }, new Date("2026-10-20T00:00:00Z"))?.kind, "spots");
  assert.equal(
    (spotsStatus({ ...base, full: false, spots_left: 6 }, new Date("2026-10-20T00:00:00Z")) as { withinWeek: boolean }).withinWeek,
    false,
  );
  // Read on Monday, built on Friday: still within the week, so the weekday is shown.
  assert.equal(
    (spotsStatus({ ...base, full: false, spots_left: 6 }, new Date("2026-10-17T12:00:00Z")) as { withinWeek: boolean }).withinWeek,
    true,
  );
  assert.equal(spotsStatus({ ...base, full: false, spots_left: null }, built), null);
});

const card: CardFacts = {
  id: "x",
  date: "2026-10-24",
  weekday: 6,
  time: "morning",
  area: "philadelphia",
  cause: "food",
  type: "service",
  join: "drop_in",
  training: "false",
  spanish: "unknown",
  host: "business-led",
  faith: "",
  activities: ["outdoors", "physical"],
  team: "false",
  kind: "dated",
};
const today = "2026-10-20"; // a Tuesday
const none = new Set<string>();

test("day filters", () => {
  const f = (day: string, date = "") => matches(card, { ...EMPTY_FILTERS, day, date }, today, none);
  assert.equal(f(""), true);
  assert.equal(f("today"), false);
  assert.equal(f("this_week"), true);
  assert.equal(f("this_weekend"), true);
  assert.equal(f("pick_date", "2026-10-24"), true);
  assert.equal(f("pick_date", "2026-10-25"), false);
  assert.equal(matches({ ...card, date: "2026-10-21", weekday: 3 }, { ...EMPTY_FILTERS, day: "tomorrow" }, today, none), true);
});

test("show only and hide tags, unknown never counts as a match", () => {
  const f = (state: Partial<typeof EMPTY_FILTERS>) => matches(card, { ...EMPTY_FILTERS, ...state }, today, none);
  assert.equal(f({ host: "hide:business-led" }), false);
  assert.equal(f({ host: "only:business-led" }), true);
  assert.equal(f({ host: "only:nonprofit" }), false);
  assert.equal(f({ activity: "hide:indoors" }), true);
  assert.equal(f({ activity: "only:outdoors" }), true);
  assert.equal(f({ no_training: true }), true);
  assert.equal(matches({ ...card, training: "" }, { ...EMPTY_FILTERS, no_training: true }, today, none), false);
  assert.equal(f({ spanish: true }), false);
  assert.equal(f({ saved: true }), false);
  assert.equal(matches(card, { ...EMPTY_FILTERS, saved: true }, today, new Set(["x"])), true);
  // Kind (Dated shifts by default) always counts as one (owner, 2026-11-10).
  assert.equal(activeCount({ ...EMPTY_FILTERS, day: "pick_date" }), 1);
  assert.equal(activeCount({ ...EMPTY_FILTERS, day: "today", spanish: true }), 3);
});

test("calendar file follows RFC 5545", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const long = "DESCRIPTION:" + "é".repeat(80);
  for (const line of foldLine(long).split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  const ics = buildIcs(sample.events[0], { location: "100 Example Street", description: "Hello" });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261020T220000Z\r\n/);
  assert.match(ics, /DTEND:20261021T003000Z\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test("saved shifts are cleared once over or no longer listed (owner, Q32)", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const live = new Map([
    ["future", Date.parse("2026-10-24T13:00:00Z")],
    ["ended", Date.parse("2026-10-20T22:30:00Z")],
    ["ends-now", now],
  ]);
  const kept = pruneSaved(["future", "ended", "gone", "ends-now"], live, now);
  assert.deepEqual([...kept].sort(), ["ends-now", "future"]);
  assert.equal(pruneSaved([], live, now).size, 0);
});

// Place line on cards and listing pages (decision 0013, PROJECT.md 4).

const languageFiles = Object.fromEntries(
  ["en", "es"].map((code) => [code, JSON.parse(readFileSync(new URL(`../src/i18n/${code}.json`, import.meta.url), "utf8"))]),
);
const placeI18n = createI18n(settings, languageFiles);
const enTr = placeI18n.translator("en");
const esTr = placeI18n.translator("es");
const place = (section: string | null | undefined, neighborhood: string | null): PreparedListing =>
  ({ ...prepareListings(sample, settings, { now: before })[0], section, neighborhood_or_town: neighborhood }) as PreparedListing;
const pairLike = /^River Wards\s*\S\s*Kensington$/;

test("card place line: section and neighborhood together", () => {
  assert.match(placeText(enTr, place("river-wards", "Kensington"), settings), pairLike);
  assert.match(placeText(esTr, place("northwest", "Washington Square West"), settings), /^Noroeste de Filadelfia\s*\S\s*Washington Square West$/);
});

test("card place line for screen readers: a comma between the two, never the dot", () => {
  assert.equal(placeSpoken(enTr, place("river-wards", "Kensington"), settings), "River Wards, Kensington");
  assert.equal(placeSpoken(esTr, place("northwest", "Germantown"), settings), "Noroeste de Filadelfia, Germantown");
  // One name only: nothing extra to say; the shown text reads fine.
  assert.equal(placeSpoken(enTr, place("river-wards", null), settings), "");
  assert.equal(placeSpoken(enTr, place(null, "Kensington"), settings), "");
  assert.equal(placeSpoken(enTr, place("center-city", "Center City"), settings), "");
});

test("card place line text always comes from the language files", () => {
  const words = readFileSync(new URL("../src/lib/words.ts", import.meta.url), "utf8");
  assert.doesNotMatch(words, /`\$\{section\} · \$\{neighborhood\}`/);
});

test("card place line: only one of them known shows that one", () => {
  assert.equal(placeText(enTr, place("river-wards", null), settings), "River Wards");
  assert.equal(placeText(enTr, place(null, "Kensington"), settings), "Kensington");
  // An id the settings do not list counts as unknown.
  assert.equal(placeText(enTr, place("nowhere", "Kensington"), settings), "Kensington");
  // Neighborhood is a proper name: never translated.
  assert.equal(placeText(esTr, place(undefined, "Kensington"), settings), "Kensington");
});

test("card place line: neither known shows the area name, as before", () => {
  assert.equal(placeText(enTr, place(null, null), settings), "Philadelphia");
  assert.equal(placeText(esTr, place(undefined, null), settings), "Filadelfia");
});

test("settings with no sections: no section names, the site still builds", () => {
  const noSections = structuredClone(settings);
  delete noSections.sections;
  checkSettings(noSections, "no sections");
  assert.equal(sectionName(enTr, noSections, "river-wards"), "");
  assert.equal(placeText(enTr, place("river-wards", "Kensington"), noSections), "Kensington");
  assert.equal(placeText(enTr, place("river-wards", null), noSections), "Philadelphia");
  assert.throws(() => checkSettings({ ...settings, sections: "x" } as unknown as SiteSettings, "bad"), /sections/);
});

test("listing page place lines: address, neighborhood, section, area; no empties or repeats", () => {
  const e = { ...place("river-wards", "Kensington"), address: "100 Example Street, Philadelphia, PA 19125" };
  assert.deepEqual(whereLines(enTr, e, settings), [
    "100 Example Street, Philadelphia, PA 19125",
    "Kensington",
    "River Wards",
    "Philadelphia",
  ]);
  assert.deepEqual(whereLines(enTr, { ...place("center-city", "Center City"), address: null }, settings), [
    "Center City",
    "Philadelphia",
  ]);
  assert.deepEqual(whereLines(esTr, { ...place(null, null), address: null }, settings), ["Filadelfia"]);
});

// Flexible opportunities (decision 0018).

const opportunities: OpportunitiesFile = JSON.parse(
  readFileSync(new URL("../../docs/examples/opportunities.sample.json", import.meta.url), "utf8"),
);

test("flexible opportunities: sample passes the file check; broken files fail plainly", () => {
  checkOpportunitiesFile(opportunities, "sample");
  assert.throws(() => checkOpportunitiesFile({ generated_at: "x" } as unknown as OpportunitiesFile, "bad"), /"opportunities" list/);
  const twice = { ...opportunities, opportunities: [opportunities.opportunities[0], opportunities.opportunities[0]] };
  assert.throws(() => checkOpportunitiesFile(twice, "twice"), /twice/);
  const noUrl = structuredClone(opportunities);
  (noUrl.opportunities[0] as unknown as Record<string, unknown>).signup_url = "";
  assert.throws(() => checkOpportunitiesFile(noUrl, "no url"), /signup_url/);
});

test("flexible opportunities: sorted by title; campaigns only when switched on; protest_action is sensitive", () => {
  const file = structuredClone(opportunities);
  const all = prepareOpportunities(file, settings);
  assert.deepEqual(
    all.map((o) => o.title),
    file.opportunities.map((o) => o.title).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
  );
  const n = file.opportunities.length;
  file.opportunities[0].type = "campaign";
  assert.equal(prepareOpportunities(file, { ...settings, features: { campaigns: false } }).length, n - 1);
  assert.equal(prepareOpportunities(file, { ...settings, features: { campaigns: true } }).length, n);
  file.opportunities[0].type = "protest_action";
  file.opportunities[0].sensitive = false;
  assert.equal(prepareOpportunities(file, settings).find((o) => o.id === file.opportunities[0].id)?.sensitive, true);
});

test("flexible opportunities: an empty time-asked text counts as none", () => {
  const file = structuredClone(opportunities);
  file.opportunities[0].commitment = "   ";
  assert.equal(prepareOpportunities(file, settings).find((o) => o.id === file.opportunities[0].id)?.commitment, null);
});

test("flexible filters: part of the city, cause and how to join", () => {
  const card = { section: "river-wards", cause: "animals", join: "application" };
  assert.ok(flexibleMatches(card, EMPTY_FLEXIBLE_FILTERS));
  assert.ok(flexibleMatches(card, { section: "river-wards", cause: "animals", join: "application" }));
  assert.ok(!flexibleMatches(card, { ...EMPTY_FLEXIBLE_FILTERS, section: "west" }));
  assert.ok(!flexibleMatches(card, { ...EMPTY_FLEXIBLE_FILTERS, cause: "food" }));
  assert.ok(!flexibleMatches(card, { ...EMPTY_FLEXIBLE_FILTERS, join: "drop_in" }));
  // An opportunity with no section shows only when no section is chosen.
  assert.ok(!flexibleMatches({ ...card, section: "" }, { ...EMPTY_FLEXIBLE_FILTERS, section: "west" }));
  assert.equal(flexibleActiveCount(EMPTY_FLEXIBLE_FILTERS), 0);
  assert.equal(flexibleActiveCount({ section: "west", cause: "", join: "signup" }), 2);
});

test("flexible opportunities use the same place line as listings", () => {
  const prepared = prepareOpportunities(opportunities, settings);
  const shelter = prepared.find((o) => o.id === "sample-shelter-dog-outings")!;
  const garden = prepared.find((o) => o.id === "sample-garden-open-volunteering")!;
  assert.equal(placeText(enTr, shelter, settings), "River Wards · Fishtown");
  assert.equal(placeSpoken(enTr, shelter, settings), "River Wards, Fishtown");
  assert.equal(placeText(esTr, garden, settings), "Filadelfia");
  assert.equal(placeSpoken(esTr, garden, settings), "");
});

test("calendar file event id ends in @citywide-volunteers (decision 0021)", () => {
  const ics = buildIcs(sample.events[0], { location: "100 Example Street", description: "Hello" });
  assert.match(ics, new RegExp(`\\r?\\nUID:${sample.events[0].id}@citywide-volunteers\\r?\\n`));
  assert.doesNotMatch(ics, /citywide-volunteer-hub/);
});

// Volunteer Teams (decision 0020).

test("Kind filter: dated shifts by default, flexible opportunities, or everything for a Volunteer Team", () => {
  const datedTeam = { ...card, team: "true" };
  const flex = { ...card, kind: "flexible", date: "", time: "" };
  const flexTeam = { ...flex, team: "true" };
  const kind = (k: string) => ({ ...EMPTY_FILTERS, kind: k });
  const shows = (state: typeof EMPTY_FILTERS) => [card, datedTeam, flex, flexTeam].map((c) => matches(c, state, today, none));
  assert.deepEqual(shows(EMPTY_FILTERS), [true, true, false, false]);
  assert.deepEqual(shows(kind("flexible")), [false, false, true, true]);
  assert.deepEqual(shows(kind("teams")), [false, true, false, true]);
  // Day and time never hide a flexible card; they still apply to dated team shifts.
  const tomorrowEvening = { ...kind("teams"), day: "today", time: "evening" };
  assert.deepEqual(shows(tomorrowEvening), [false, false, false, true]);
  assert.deepEqual(shows({ ...kind("flexible"), day: "today", time: "evening" }), [false, false, true, true]);
  // Other filters still apply to flexible cards.
  assert.deepEqual(shows({ ...kind("flexible"), cause: "animals" }), [false, false, false, false]);
  // With Flexible, day and time are off, so they are not counted as filters on.
  assert.equal(activeCount({ ...kind("flexible"), day: "today", time: "evening" }), 1, "flexible: day and time are off; Kind is the one");
  assert.equal(activeCount({ ...kind("teams"), day: "today" }), 2);
  assert.equal(activeCount(EMPTY_FILTERS), 1, "no choices made: Dated shifts is the one filter on (owner, 2026-11-10)");
});

test("team fields: true only when the file says true; blank words count as none; older files still work", () => {
  const file = structuredClone(sample);
  const listings = prepareListings(file, settings, { now: before });
  const teamIds = file.events.filter((e) => e.team_required === true).map((e) => e.id);
  assert.ok(teamIds.length > 0, "the sample has a team listing");
  for (const e of listings) assert.equal(e.team_required, teamIds.includes(e.id));
  const older = structuredClone(sample);
  for (const e of older.events) {
    delete e.team_required;
    delete e.team_size;
    delete e.team_task;
  }
  assert.ok(prepareListings(older, settings, { now: before }).every((e) => e.team_required === false && e.team_size === null && e.team_task === null));
  const blank = structuredClone(opportunities);
  blank.opportunities[0].team_required = "yes" as unknown as boolean;
  blank.opportunities[0].team_task = "  ";
  const o = prepareOpportunities(blank, settings).find((x) => x.id === blank.opportunities[0].id)!;
  assert.equal(o.team_required, false);
  assert.equal(o.team_task, null);
});

// About page running totals (owner, 2026-11-10).

test("About page totals: shifts plus cards; only the four whole numbers are read", () => {
  const file = { version: 4, note: "private words", totals: { shifts: 459, cards: 59, organizations: 86, neighborhoods: 35 } };
  assert.deepEqual(readTotals(file, "f"), { opportunities: 518, organizations: 86, neighborhoods: 35 });
  assert.ok(!JSON.stringify(readTotals(file, "f")).includes("private"));
  for (const bad of [{}, { totals: {} }, { totals: { ...file.totals, cards: -1 } }, { totals: { ...file.totals, shifts: 1.5 } }, { totals: { ...file.totals, organizations: "86" } }, null]) {
    assert.throws(() => readTotals(bad, "f"), /totals\./, JSON.stringify(bad));
  }
});

// Share panel (decision 0027).

test("share links: every address is well-formed and carries the listing's words, never the title in an email subject", () => {
  const input = {
    url: "https://volunteer.example.org/es/listing/abc/",
    message: "Limpieza del parque junto al río, jueves 24 de octubre & más",
    subject: "Una oportunidad de voluntariado",
  };
  const links = shareLinks(input);
  assert.deepEqual(Object.keys(links).sort(), [...SHARE_TARGETS].sort());
  for (const [target, href] of Object.entries(links)) {
    const u = new URL(href);
    if (target === "sms") assert.equal(u.protocol, "sms:");
    else if (target === "email") assert.equal(u.protocol, "mailto:");
    else assert.equal(u.protocol, "https:", target);
    assert.doesNotMatch(href, /\s/, `${target}: no spaces`);
  }
  const query = (href: string) => new URLSearchParams(href.slice(href.indexOf("?") + 1));
  assert.equal(query(links.sms).get("body"), `${input.message} ${input.url}`);
  assert.equal(query(links.whatsapp).get("text"), `${input.message} ${input.url}`);
  assert.equal(query(links.facebook).get("u"), input.url);
  assert.equal(query(links.x).get("text"), input.message);
  assert.equal(query(links.x).get("url"), input.url);
  assert.equal(query(links.bluesky).get("text"), `${input.message} ${input.url}`);
  assert.equal(query(links.email).get("subject"), input.subject);
  assert.equal(query(links.email).get("body"), `${input.message}\n\n${input.url}`);
  assert.ok(!query(links.email).get("subject")!.includes("Limpieza"), "the title never goes in the subject");
  assert.equal(new URL(links.whatsapp).host, "wa.me");
  assert.equal(new URL(links.bluesky).host, "bsky.app");
});

test("picture text wraps to the width and shrinks to fit, at English and Spanish lengths", () => {
  const measure = (s: string) => s.length * 10; // 10 px a letter
  assert.deepEqual(wrapLines("Host a supper with your own team", 120, measure), ["Host a", "supper with", "your own", "team"]);
  // A word longer than a line is broken, never left running off the picture.
  for (const line of wrapLines("Supercalifragilistic word", 80, measure)) assert.ok(measure(line) <= 80, line);
  const measureAt = (s: string, size: number) => s.length * size * 0.5;
  const es = "Limpieza del parque junto al río Schuylkill con el Centro Schuylkill de Educación Ambiental";
  const fitted = fitText(es, 720, 6, [104, 92, 80, 70, 62], measureAt);
  assert.ok(fitted.lines.length <= 6);
  for (const line of fitted.lines) assert.ok(measureAt(line, fitted.size) <= 720, line);
  // Too long even at the smallest size: cut with "…", still inside the width.
  const huge = fitText(es.repeat(6), 720, 6, [104, 62], measureAt);
  assert.equal(huge.lines.length, 6);
  assert.ok(huge.lines[5].endsWith("…"));
  for (const line of huge.lines) assert.ok(measureAt(line, huge.size) <= 720, line);
  // Short text keeps the biggest size.
  assert.equal(fitText("Food pantry", 720, 6, [104, 92], measureAt).size, 104);
});

test("picture: every word stays out of the top and bottom ~250 px Instagram covers, with space under the card", () => {
  assert.ok(STORY_SAFE_TOP >= 250 && STORY_SAFE_BOTTOM <= 1920 - 250);
  for (const cardHeight of [500, 800, 1000, 1100]) {
    const p = placePicture(cardHeight);
    assert.ok(p.fits, `${cardHeight} fits`);
    assert.ok(p.nameY >= STORY_SAFE_TOP);
    assert.ok(p.cardTop > p.nameY + 60, "the card sits under the site name");
    assert.ok(p.footerY >= p.cardTop + cardHeight + 40, "a little space under the card");
    assert.ok(p.footerY + 60 + 44 <= STORY_SAFE_BOTTOM, "the address ends inside the free area");
  }
  // A card too tall says so, so the picture is drawn again with smaller text.
  assert.equal(placePicture(1400).fits, false);
});

// Search (owner, 2026-11-08).

test("search: ignores case and accents, needs every word, empty matches all", () => {
  assert.equal(normalizeSearch("  Café   ÁRBOL niño "), "cafe arbol nino");
  const card = "cafe comunitario en el norte de filadelfia comida inscribirse antes";
  assert.ok(searchMatches(card, "café"));
  assert.ok(searchMatches(card, "CAFE"));
  assert.ok(searchMatches(card, "Filadelfia comida"));
  assert.ok(!searchMatches(card, "filadelfia parques"), "every word must match");
  assert.ok(searchMatches(card, ""));
  assert.ok(searchMatches(card, "   "));
  assert.ok(searchMatches("Árbol", "arbol") && searchMatches("arbol", "Árbol"));
});

test("search words are never part of the stored filters", () => {
  assert.ok(!("search" in EMPTY_FILTERS) && !("query" in EMPTY_FILTERS));
  assert.ok(!("search" in EMPTY_FLEXIBLE_FILTERS));
});

// Progress page (owner, 2026-11-10): the data file is checked, and news dates read in words.
test("progress data: checked plainly; news dates as a day, a range or a month", async () => {
  const { checkProgress, newsDate } = await import("../src/lib/progress.ts");
  const file = JSON.parse(readFileSync(new URL("../src/data/progress.json", import.meta.url), "utf8"));
  checkProgress(file);
  assert.throws(() => checkProgress({ ...file, phases: [{ id: "p1", number: "1", status: "almost", percent: 50 }] }), /status/);
  assert.throws(() => checkProgress({ ...file, phases: [{ id: "p1", number: "1", status: "building", percent: 120 }] }), /percent/);
  assert.throws(() => checkProgress({ ...file, news: [{ id: "n1" }] }), /news n1/);
  assert.equal(newsDate({ id: "a", date: "2026-11-10" }, "en"), "November 10, 2026");
  assert.equal(newsDate({ id: "a", month: "2026-10" }, "en"), "October 2026");
  assert.equal(newsDate({ id: "a", month: "2026-10" }, "es"), "octubre de 2026");
  // Ranges come from the translation, not a dash (accessibility gate); the year is said once.
  assert.equal(newsDate({ id: "a", from: "2026-11-05", to: "2026-11-08" }, "en", "{from} to {to}"), "November 5 to November 8, 2026");
  assert.equal(newsDate({ id: "a", from: "2026-11-05", to: "2026-11-08" }, "es", "Del {from} al {to}"), "Del 5 de noviembre al 8 de noviembre de 2026");
  assert.equal(newsDate({ id: "a", from: "2026-12-30", to: "2027-01-02" }, "en", "{from} to {to}"), "December 30, 2026 to January 2, 2027");
});
