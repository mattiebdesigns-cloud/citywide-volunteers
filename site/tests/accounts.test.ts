// Phase 2 plan task 2.1: the calendar's links to the account pages and the
// public /listings.json they read (decisions 0033, 0047, 0017 amendment;
// web/README.md contract in the private repo; PROJECT.md 3, 6, 8.1, 11.2).
// Run from site/: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { astroBuild, buildFolder, removeFolder } from "./build-helper.ts";
import {
  LISTING_ID,
  ORG_ID,
  SERIES_ID,
  accountsUrl,
  clockText,
  eventFavorite,
  favoriteIds,
  favoriteUrl,
  flexibleFavoriteUrl,
  hostFavoriteUrl,
  listingsFile,
  sortingFacts,
  logUrl,
  reportUrl,
  weeklyUrl,
} from "../src/lib/accounts.ts";
import { isSensitive, prepareListings, prepareOpportunities } from "../src/lib/prepare.ts";
import { placeId } from "../src/lib/ids.ts";
import { localParts } from "../src/lib/time.ts";
import { createI18n } from "../src/i18n/index.ts";
import type { EventsFile, OpportunitiesFile, SiteSettings } from "../src/lib/types.ts";

const site = fileURLToPath(new URL("..", import.meta.url));
const settings: SiteSettings = JSON.parse(readFileSync(join(site, "settings.example.json"), "utf8"));
const sample: EventsFile = JSON.parse(readFileSync(join(site, "../docs/examples/events.sample.json"), "utf8"));
const opp: OpportunitiesFile = JSON.parse(readFileSync(join(site, "../docs/examples/opportunities.sample.json"), "utf8"));
const i18n = createI18n(settings, Object.fromEntries(["en", "es"].map((c) => [c, JSON.parse(readFileSync(join(site, `src/i18n/${c}.json`), "utf8"))])));
const tr = { en: i18n.translator("en"), es: i18n.translator("es") } as Record<string, ReturnType<typeof i18n.translator>>;
const MY = "https://my.phillyvolunteers.org";
const FIELDS = [
  "activities",
  "area",
  "cause",
  "end",
  "flexible",
  "id",
  "listing_language",
  "org_id",
  "org_name",
  "place_id",
  "sensitive",
  "series_id",
  "start",
  "start_time",
  "team_required",
  "title",
];
const TZ = settings.site.timezone;
// Test ids in the event format's shape (decision 0060); the pipeline computes the real ones.
const hex = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const orgId = (name: string) => `o-${hex(`org ${name}`)}`;
const seriesId = (id: string) => `s-${hex(`series ${id}`)}`;

test("accounts address: empty means off; otherwise https, no path, no trailing slash", () => {
  assert.equal(accountsUrl(settings), "");
  assert.equal(accountsUrl({ accounts: { url: "" } }), "");
  assert.equal(accountsUrl({ accounts: { url: MY } }), MY);
  for (const bad of ["http://my.example.org", "https://my.example.org/", "https://my.example.org/x", "javascript:alert(1)"]) {
    assert.throws(() => accountsUrl({ accounts: { url: bad } }), /accounts\.url/, bad);
  }
});

test("links: the id goes after #; Spanish pages use /es/; weekly email has no id", () => {
  assert.equal(logUrl(MY, "en", "s-0007"), `${MY}/log/#listing=s-0007`);
  assert.equal(logUrl(MY, "es", "s-0007"), `${MY}/es/log/#listing=s-0007`);
  assert.equal(reportUrl(MY, "en", "s-0007"), `${MY}/report/#listing=s-0007`);
  assert.equal(weeklyUrl(MY, "es"), `${MY}/es/weekly/`);
  assert.ok(LISTING_ID.test("3f9a1c0e7b2d4a6f") && !LISTING_ID.test("Has_Caps") && !LISTING_ID.test("-lead"));
});

test("favorites links (decision 0060): ids only, after #; series on recurring, host offered on one-time, nothing when accounts are off", () => {
  const org = orgId("Sample Org");
  const series = seriesId("x");
  assert.ok(ORG_ID.test(org) && SERIES_ID.test(series));
  assert.equal(favoriteUrl(MY, "en", "add", "series", series), `${MY}/recommended/#add=series:${series}`);
  assert.equal(favoriteUrl(MY, "es", "offer", "host", org), `${MY}/es/recommended/#offer=host:${org}`);
  // Recurring with a series id: the series.
  assert.deepEqual(eventFavorite(MY, "en", { recurring: true, series_id: series, org_id: org }), {
    href: `${MY}/recommended/#add=series:${series}`,
    kind: "series",
  });
  // One-time: the host is offered, not saved straight away.
  assert.deepEqual(eventFavorite(MY, "es", { recurring: false, series_id: null, org_id: org }), {
    href: `${MY}/es/recommended/#offer=host:${org}`,
    kind: "one-time",
  });
  // A series id on a listing that is not recurring does not count (event format rule).
  assert.equal(eventFavorite(MY, "en", { recurring: false, series_id: series, org_id: org })!.kind, "one-time");
  assert.equal(favoriteIds({ recurring: false, series_id: series }).series_id, null);
  // Recurring with no usable series id: no ☆ of its own (it is not a one-time event either).
  assert.equal(eventFavorite(MY, "en", { recurring: true, series_id: null, org_id: org }), null);
  // No ids (older files) or misshapen ids: no links.
  assert.equal(eventFavorite(MY, "en", { recurring: false }), null);
  assert.equal(hostFavoriteUrl(MY, "en", {}), "");
  for (const bad of ["o-XYZ", "O-0123456789abcdef", "o-0123456789abcdef0", "https://x", "o-0123456789abcde#"]) {
    assert.equal(hostFavoriteUrl(MY, "en", { org_id: bad }), "", bad);
  }
  assert.equal(hostFavoriteUrl(MY, "en", { org_id: org }), `${MY}/recommended/#add=host:${org}`);
  // Flexible opportunities ("Flexible and team shifts"): by their own id; not when the id cannot be used.
  assert.equal(flexibleFavoriteUrl(MY, "es", "b2c4e6f8a0b1c3d5"), `${MY}/es/recommended/#add=flexible:b2c4e6f8a0b1c3d5`);
  assert.equal(flexibleFavoriteUrl(MY, "en", "Bad_Id"), "");
  assert.equal(flexibleFavoriteUrl("", "en", "b2c4e6f8a0b1c3d5"), "");
  // Accounts off (plan task 1.3): no links at all.
  assert.equal(eventFavorite("", "en", { recurring: true, series_id: series, org_id: org }), null);
  assert.equal(hostFavoriteUrl("", "en", { org_id: org }), "");
});

test("listings.json: org_id and series_id pass through; null when missing, misshapen, or (series) not recurring; never a series on a flexible entry", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const events = structuredClone(sample);
  for (const e of events.events) {
    e.org_id = orgId(e.org_name);
    e.series_id = e.recurring ? seriesId(e.id) : null;
  }
  const opps = structuredClone(opp);
  for (const o of opps.opportunities) o.org_id = orgId(o.org_name);
  // A stray series id on a flexible entry is never passed on.
  (opps.opportunities[0] as unknown as Record<string, unknown>).series_id = seriesId("flexible");
  const file = listingsFile(events, prepareListings(events, settings, { now }), prepareOpportunities(opps, settings), TZ);
  for (const e of events.events) {
    const x = file.listings.find((y) => y.id === e.id);
    if (!x) continue;
    assert.equal(x.org_id, e.org_id, e.id);
    assert.equal(x.series_id, e.recurring ? e.series_id : null, e.id);
  }
  assert.ok(file.listings.some((x) => x.series_id !== null), "a recurring listing carries its series id");
  // place_id (decision 0063) from org_id and the address; start_time (decision 0062) is the local "HH:MM".
  for (const e of events.events) {
    const x = file.listings.find((y) => y.id === e.id);
    if (!x) continue;
    assert.equal(x.place_id, placeId(e.org_id, e.address), e.id);
    assert.equal(x.start_time, clockText(localParts(e.start, TZ).minutes), e.id);
    assert.match(x.start_time!, /^([01]\d|2[0-3]):[0-5]\d$/);
  }
  assert.ok(file.listings.some((x) => x.place_id !== null), "a listing with an address carries its place id");
  for (const o of opps.opportunities) assert.equal(file.listings.find((y) => y.id === o.id)!.start_time, null);
  for (const o of opps.opportunities) {
    const x = file.listings.find((y) => y.id === o.id)!;
    assert.equal(x.org_id, o.org_id);
    assert.equal(x.series_id, null);
  }
  // Older files without the ids still work; misshapen ids become null.
  const old = listingsFile(sample, prepareListings(sample, settings, { now }), [], TZ);
  assert.ok(old.listings.every((x) => x.org_id === null && x.series_id === null));
  const bad = structuredClone(sample);
  bad.events[0].org_id = "<script>";
  bad.events[0].series_id = "s-not-hex";
  const b = listingsFile(bad, prepareListings(bad, settings, { now }), [], TZ).listings.find((x) => x.id === bad.events[0].id)!;
  assert.equal(b.org_id, null);
  assert.equal(b.series_id, null);
});

test("listings.json: exactly the contract's fields; dated and flexible; sensitive from isSensitive(); never the wider 0017 set", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const listings = prepareListings(sample, settings, { now });
  const opps = prepareOpportunities(opp, settings);
  const file = listingsFile(sample, listings, opps, TZ);
  assert.deepEqual(Object.keys(file).sort(), ["generated_at", "listings"]);
  assert.equal(file.listings.length, listings.length + opps.length);
  for (const l of file.listings) {
    assert.deepEqual(Object.keys(l).sort(), FIELDS, l.id);
    assert.match(l.id, LISTING_ID);
  }
  // Condition 1: the file's sensitive is isSensitive() for every listing.
  for (const e of listings) assert.equal(file.listings.find((x) => x.id === e.id)!.sensitive, isSensitive(e), e.id);
  for (const o of opps) {
    const x = file.listings.find((y) => y.id === o.id)!;
    assert.equal(x.sensitive, isSensitive(o));
    assert.equal(x.flexible, true);
    assert.equal(x.start, null);
    assert.equal(x.end, null);
  }
  // Condition 2: only the listing's own mark. A plain listing from an organization that also
  // runs a sensitive listing stays not sensitive.
  const sens = sample.events.find((e) => isSensitive(e))!;
  const twin = { ...structuredClone(sample.events.find((e) => !isSensitive(e))!), id: "same-org-plain", org_name: sens.org_name, source_id: sens.source_id };
  const f2 = listingsFile(sample, prepareListings({ ...sample, events: [...sample.events, twin] }, settings, { now }), [], TZ);
  assert.equal(f2.listings.find((x) => x.id === "same-org-plain")!.sensitive, false);
  // An id the account pages cannot use is left out.
  const bad = { ...structuredClone(sample.events[0]), id: "Bad_Id" };
  assert.ok(!listingsFile(sample, prepareListings({ ...sample, events: [bad] }, settings, { now }), [], TZ).listings.some((x) => x.id === "Bad_Id"));
  // The file names no person: only the sixteen listing facts.
  assert.doesNotMatch(JSON.stringify(file), /email|attend|going|signed|account|contact/i);
});

test("listings.json: cause, activities and team_required (decision 0064, Q247 (a)) are the listing's own, as the calendar shows them", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const listings = prepareListings(sample, settings, { now });
  const opps = prepareOpportunities(opp, settings);
  const file = listingsFile(sample, listings, opps, TZ);
  for (const e of [...listings, ...opps]) {
    const x = file.listings.find((y) => y.id === e.id)!;
    assert.equal(x.cause, e.cause ?? null, e.id);
    assert.deepEqual(x.activities, e.activity ?? [], e.id);
    assert.equal(x.team_required, e.team_required === true, e.id);
    if (x.cause !== null) assert.ok(settings.causes.includes(x.cause), `${e.id}: cause is from the settings' list`);
    for (const a of x.activities) assert.ok((settings.activities ?? []).includes(a), `${e.id}: activity ${a} is from the settings' list`);
  }
  // The sample really exercises each field.
  assert.ok(file.listings.some((x) => x.cause !== null), "a listing with a cause");
  assert.ok(file.listings.some((x) => x.activities.length > 0), "a listing with activities");
  assert.ok(file.listings.some((x) => x.team_required) && file.listings.some((x) => !x.team_required), "team and not team");
  // Older files without them, and odd values: null, [] and false; never anything else.
  assert.deepEqual(sortingFacts({}), { cause: null, activities: [], team_required: false });
  assert.deepEqual(sortingFacts({ cause: "<b>", activity: ["outdoors", "Bad Id", "outdoors", 7 as unknown as string], team_required: "yes" as unknown as boolean }), {
    cause: null,
    activities: ["outdoors"],
    team_required: false,
  });
  assert.deepEqual(sortingFacts({ cause: "food", activity: null, team_required: true }), { cause: "food", activities: [], team_required: true });
});

// ---- Built pages, both ways (decision 0033: "A test builds the calendar both ways") ----

const shift = (iso: string) => iso.replace(/^20(\d\d)/, (_, yy) => `21${yy}`);
function inputs(dir: string, accounts: string) {
  const events = structuredClone(sample);
  for (const e of events.events) {
    e.start = shift(e.start);
    if (e.end) e.end = shift(e.end);
  }
  // Favorites ids (decision 0060), and one sensitive recurring listing: it keeps its ☆
  // (the account pages keep that favorite on the device only).
  const rec = events.events.find((e) => e.recurring)!;
  events.events.push({ ...structuredClone(rec), id: "sensitive-recurring", sensitive: true, title: "Sample support group helpers" });
  for (const e of events.events) {
    e.org_id = orgId(e.org_name);
    e.series_id = e.recurring ? seriesId(e.id) : null;
  }
  const s = structuredClone(settings);
  if (accounts) s.accounts = { url: accounts };
  writeFileSync(join(dir, "events.json"), JSON.stringify(events));
  writeFileSync(join(dir, "settings.json"), JSON.stringify(s));
  return { PV_EVENTS: join(dir, "events.json"), PV_SETTINGS: join(dir, "settings.json") };
}
function htmlFiles(out: string): string[] {
  const found: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) found.push(p);
    }
  };
  walk(out);
  return found;
}

test("accounts off (today): no /listings.json, no account links, no sensitive note, no weekly link, no favorites links", () => {
  const dir = buildFolder();
  try {
    const out = astroBuild(dir, inputs(dir, ""));
    assert.ok(!existsSync(join(out, "listings.json")), "no listings file");
    for (const p of htmlFiles(out)) {
      const html = readFileSync(p, "utf8");
      assert.doesNotMatch(
        html,
        /data-account-links|data-sensitive-note|data-card-log|data-weekly|data-favorite|favorites\/|recommended\/|#add=|#offer=|my\.phillyvolunteers|#listing=/,
        p.slice(out.length),
      );
    }
  } finally {
    removeFolder(dir);
  }
});

test("accounts on: listings.json, log and report links, card log links, weekly link, no referrer; the file and the note agree for every listing, dated and flexible", () => {
  const dir = buildFolder();
  try {
    // One flexible entry is sensitive in this copy, so the card note is really tested.
    const opps = structuredClone(opp);
    opps.opportunities[1].sensitive = true;
    writeFileSync(join(dir, "opportunities.json"), JSON.stringify(opps));
    const out = astroBuild(dir, { ...inputs(dir, MY), PV_OPPORTUNITIES: join(dir, "opportunities.json") });
    const file = JSON.parse(readFileSync(join(out, "listings.json"), "utf8"));
    assert.deepEqual(Object.keys(file).sort(), ["generated_at", "listings"]);
    for (const l of file.listings) assert.deepEqual(Object.keys(l).sort(), FIELDS);
    let checked = 0;
    let cards = 0;
    let favorites = 0;
    for (const lang of ["en", "es"]) {
      const prefix = lang === "en" ? "" : "/es";
      for (const l of file.listings.filter((x: { flexible: boolean }) => !x.flexible)) {
        const page = join(out, lang, "listing", l.id, "index.html");
        if (!existsSync(page)) continue;
        checked += 1;
        const html = readFileSync(page, "utf8");
        // Conditions 1 and 3: the page's note and the file's mark come from the same value, in the same build.
        assert.equal(html.includes("data-sensitive-note"), l.sensitive, `${lang} ${l.id}: note matches the file`);
        assert.ok(html.includes(`href="${MY}${prefix}/log/#listing=${l.id}"`), `${lang} ${l.id}: log link`);
        assert.ok(html.includes(`href="${MY}${prefix}/report/#listing=${l.id}"`), `${lang} ${l.id}: report link`);
        // Only "Report a safety concern" is the link; who reads it follows as plain text.
        const report = html.match(/<p data-report[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<span[^>]*>([\s\S]*?)<\/span>/)!;
        assert.equal(report[1].trim(), tr[lang].t("accounts.report_link"), `${lang} ${l.id}: link words`);
        assert.equal(report[2].replaceAll("&#39;", "'").trim(), tr[lang].t("accounts.report_note"), `${lang} ${l.id}: plain note`);
        assert.match(html, /<meta name="referrer" content="no-referrer"/);
        // Favorites (decision 0060): the host's ☆, and the listing's own ☆ (series, or host offered).
        const hostHref = `href="${MY}${prefix}/recommended/#add=host:${l.org_id}"`;
        const eventHref = l.series_id ? `href="${MY}${prefix}/recommended/#add=series:${l.series_id}"` : `href="${MY}${prefix}/recommended/#offer=host:${l.org_id}"`;
        assert.ok(html.includes(hostHref), `${lang} ${l.id}: host favorite link`);
        assert.ok(html.includes(eventHref), `${lang} ${l.id}: listing favorite link`);
        for (const href of [hostHref, eventHref]) {
          // Each link names its item for screen readers, and the star is hidden from them.
          const at = html.indexOf(href);
          const link = html.slice(at, html.indexOf("</a>", at));
          assert.match(link, /<span class="favorite-link__star"[^>]*aria-hidden="true"[^>]*>☆<\/span>/, `${lang} ${l.id}: decorative star`);
          assert.match(link, /class="sr-only"[^>]*> \S/, `${lang} ${l.id}: named link`);
          assert.ok(link.includes(l.org_name) || link.includes(l.title) || lang === "es", `${lang} ${l.id}: the link names its item`);
        }
        // The host's id is the only thing after # in every favorites link: never a name.
        for (const m of html.matchAll(/recommended\/#([^"]*)"/g)) assert.match(m[1], /^(add=series:s|add=host:o|offer=host:o)-[0-9a-f]{16}$/);
        favorites += 1;
      }
      // Calendar cards: the same ☆ for every dated listing, recurring ones saving the series.
      const homeCards = readFileSync(join(out, lang, "index.html"), "utf8");
      for (const l of file.listings.filter((x: { flexible: boolean }) => !x.flexible)) {
        const href = l.series_id ? `${MY}${prefix}/recommended/#add=series:${l.series_id}` : `${MY}${prefix}/recommended/#offer=host:${l.org_id}`;
        assert.ok(homeCards.includes(`href="${href}"`), `${lang} home card ${l.id}: favorite link`);
      }
      // A sensitive recurring listing keeps its ☆ (decision 0060: device-only on the account pages).
      const sr = file.listings.find((x: { id: string }) => x.id === "sensitive-recurring");
      assert.ok(sr && sr.sensitive && sr.series_id, "the sensitive recurring test listing is in the file with its series id");
      assert.ok(readFileSync(join(out, lang, "listing", sr.id, "index.html"), "utf8").includes(`#add=series:${sr.series_id}"`));
      // Flexible Shift cards: "Log this shift", with a name of its own, and the same note as the file
      // says, on every page that shows the card (Flexible, Teams, home).
      for (const page of ["flexible/index.html", "teams/index.html", "index.html"]) {
        const html = readFileSync(join(out, lang, page), "utf8");
        for (const l of file.listings.filter((x: { flexible: boolean }) => x.flexible)) {
          const at = html.indexOf(`href="${MY}${prefix}/log/#listing=${l.id}"`);
          if (at < 0) {
            assert.notEqual(page, "flexible/index.html", `${lang}: every flexible card has the link (${l.id})`);
            continue; // the Teams page shows only team cards
          }
          const block = html.slice(html.lastIndexOf("data-card-log", at), html.indexOf("</div>", at));
          assert.equal(block.includes("data-sensitive-note"), l.sensitive, `${lang} ${page} ${l.id}: note matches the file`);
          // The card's ☆ (decision 0060, flexible and team shifts), sensitive ones included, named for screen readers.
          const fav = html.indexOf(`href="${MY}${prefix}/recommended/#add=flexible:${l.id}"`, at);
          assert.ok(fav > at && fav < html.indexOf("</li>", at), `${lang} ${page} ${l.id}: flexible favorite link on the card`);
          const link = html.slice(fav, html.indexOf("</a>", fav));
          assert.match(link, /aria-hidden="true"[^>]*>☆<\/span>/, `${lang} ${page} ${l.id}: decorative star`);
          assert.match(link, /class="sr-only"[^>]*> \S/, `${lang} ${page} ${l.id}: named link`);
          cards += 1;
        }
      }
      // The footer's Weekly email link, on every page.
      const home = readFileSync(join(out, lang, "index.html"), "utf8");
      assert.ok(home.slice(home.indexOf("<footer")).includes(`href="${MY}${prefix}/weekly/"`));
    }
    assert.ok(checked >= 2 * sample.events.length, `listing pages checked: ${checked}`);
    assert.equal(favorites, checked, "every listing page had its favorites links checked");
    assert.ok(cards >= 2 * 2 * opps.opportunities.length, `cards checked: ${cards}`);
    // At least one sensitive dated listing and one sensitive flexible entry, so condition 1 was really tested.
    assert.ok(file.listings.some((l: { sensitive: boolean; flexible: boolean }) => l.sensitive && !l.flexible));
    assert.ok(file.listings.some((l: { sensitive: boolean; flexible: boolean }) => l.sensitive && l.flexible));
  } finally {
    removeFolder(dir);
  }
});
