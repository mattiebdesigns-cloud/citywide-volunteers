// Phase 2 plan task 2.1: the calendar's links to the account pages and the
// public /listings.json they read (decisions 0033, 0047, 0017 amendment;
// web/README.md contract in the private repo; PROJECT.md 3, 6, 8.1, 11.2).
// Run from site/: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { astroBuild, buildFolder, removeFolder } from "./build-helper.ts";
import { LISTING_ID, accountsUrl, listingsFile, logUrl, reportUrl, weeklyUrl } from "../src/lib/accounts.ts";
import { isSensitive, prepareListings, prepareOpportunities } from "../src/lib/prepare.ts";
import { createI18n } from "../src/i18n/index.ts";
import type { EventsFile, OpportunitiesFile, SiteSettings } from "../src/lib/types.ts";

const site = fileURLToPath(new URL("..", import.meta.url));
const settings: SiteSettings = JSON.parse(readFileSync(join(site, "settings.example.json"), "utf8"));
const sample: EventsFile = JSON.parse(readFileSync(join(site, "../docs/examples/events.sample.json"), "utf8"));
const opp: OpportunitiesFile = JSON.parse(readFileSync(join(site, "../docs/examples/opportunities.sample.json"), "utf8"));
const i18n = createI18n(settings, Object.fromEntries(["en", "es"].map((c) => [c, JSON.parse(readFileSync(join(site, `src/i18n/${c}.json`), "utf8"))])));
const tr = { en: i18n.translator("en"), es: i18n.translator("es") } as Record<string, ReturnType<typeof i18n.translator>>;
const MY = "https://my.phillyvolunteers.org";
const FIELDS = ["area", "end", "flexible", "id", "listing_language", "org_name", "sensitive", "start", "title"];

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

test("listings.json: exactly the contract's fields; dated and flexible; sensitive from isSensitive(); never the wider 0017 set", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const listings = prepareListings(sample, settings, { now });
  const opps = prepareOpportunities(opp, settings);
  const file = listingsFile(sample, listings, opps);
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
  const f2 = listingsFile(sample, prepareListings({ ...sample, events: [...sample.events, twin] }, settings, { now }), []);
  assert.equal(f2.listings.find((x) => x.id === "same-org-plain")!.sensitive, false);
  // An id the account pages cannot use is left out.
  const bad = { ...structuredClone(sample.events[0]), id: "Bad_Id" };
  assert.ok(!listingsFile(sample, prepareListings({ ...sample, events: [bad] }, settings, { now }), []).listings.some((x) => x.id === "Bad_Id"));
  // The file names no person: only the nine listing facts.
  assert.doesNotMatch(JSON.stringify(file), /email|attend|going|signed|account|contact/i);
});

// ---- Built pages, both ways (decision 0033: "A test builds the calendar both ways") ----

const shift = (iso: string) => iso.replace(/^20(\d\d)/, (_, yy) => `21${yy}`);
function inputs(dir: string, accounts: string) {
  const events = structuredClone(sample);
  for (const e of events.events) {
    e.start = shift(e.start);
    if (e.end) e.end = shift(e.end);
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

test("accounts off (today): no /listings.json, no account links, no sensitive note, no weekly link", () => {
  const dir = buildFolder();
  try {
    const out = astroBuild(dir, inputs(dir, ""));
    assert.ok(!existsSync(join(out, "listings.json")), "no listings file");
    for (const p of htmlFiles(out)) {
      const html = readFileSync(p, "utf8");
      assert.doesNotMatch(html, /data-account-links|data-sensitive-note|data-card-log|data-weekly|my\.phillyvolunteers|#listing=/, p.slice(out.length));
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
      }
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
          cards += 1;
        }
      }
      // The footer's Weekly email link, on every page.
      const home = readFileSync(join(out, lang, "index.html"), "utf8");
      assert.ok(home.slice(home.indexOf("<footer")).includes(`href="${MY}${prefix}/weekly/"`));
    }
    assert.ok(checked >= 2 * sample.events.length, `listing pages checked: ${checked}`);
    assert.ok(cards >= 2 * 2 * opps.opportunities.length, `cards checked: ${cards}`);
    // At least one sensitive dated listing and one sensitive flexible entry, so condition 1 was really tested.
    assert.ok(file.listings.some((l: { sensitive: boolean; flexible: boolean }) => l.sensitive && !l.flexible));
    assert.ok(file.listings.some((l: { sensitive: boolean; flexible: boolean }) => l.sensitive && l.flexible));
  } finally {
    removeFolder(dir);
  }
});
