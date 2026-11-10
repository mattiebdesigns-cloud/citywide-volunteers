// Built pages: link-preview tags and robots.txt (decision 0014; decision 0009;
// PROJECT.md 8.1), and the card place line for screen readers (decision 0013).
// Run from site/: npm test. The build tests build the site into a temporary
// folder from the sample listings, moved into the future so they never expire.
import { test } from "node:test";
import assert from "node:assert/strict";
import { astroBuild, buildFolder, removeFolder } from "./build-helper.ts";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createI18n } from "../src/i18n/index.ts";
import { cityName, previewTags, robotsTxt, type MetaTag } from "../src/lib/og.ts";
import type { EventsFile, OpportunitiesFile, SiteSettings } from "../src/lib/types.ts";

const site = fileURLToPath(new URL("..", import.meta.url));
const settings: SiteSettings = JSON.parse(readFileSync(join(site, "settings.example.json"), "utf8"));
const sample: EventsFile = JSON.parse(readFileSync(join(site, "../docs/examples/events.sample.json"), "utf8"));
const languageFiles = Object.fromEntries(
  ["en", "es"].map((code) => [code, JSON.parse(readFileSync(join(site, `src/i18n/${code}.json`), "utf8"))]),
);
const i18n = createI18n(settings, languageFiles);
const URL_ = "https://volunteer.cedarwater.net";

const get = (tags: MetaTag[], key: string) => tags.filter((m) => m.key === key).map((m) => m.content);

// ---- Plain functions ----

test("{city} is the city's main area, not the region", () => {
  assert.equal(cityName(i18n.translator("en"), settings), "Philadelphia");
  assert.equal(cityName(i18n.translator("es"), settings), "Filadelfia");
});

test("tags with a site address: full addresses, picture in the page's language", () => {
  const tags = previewTags({
    lang: "es",
    languages: ["en", "es"],
    siteName: "Site",
    title: "Site",
    description: "D",
    imageAlt: "Alt",
    path: "/es/",
    siteUrl: URL_,
  });
  assert.deepEqual(get(tags, "og:url"), [`${URL_}/es/`]);
  assert.deepEqual(get(tags, "og:image"), [`${URL_}/og/es.png`]);
  assert.deepEqual(get(tags, "og:image:width"), ["1200"]);
  assert.deepEqual(get(tags, "og:image:height"), ["630"]);
  assert.deepEqual(get(tags, "og:image:alt"), ["Alt"]);
  assert.deepEqual(get(tags, "og:locale"), ["es_US"]);
  assert.deepEqual(get(tags, "og:locale:alternate"), ["en_US"]);
  assert.deepEqual(get(tags, "twitter:card"), ["summary_large_image"]);
  assert.ok(tags.every((m) => !m.content.includes("undefined")));
});

test("no site address: og:url and og:image are left out, the rest stays", () => {
  const tags = previewTags({
    lang: "en",
    languages: ["en", "es"],
    siteName: "Site",
    title: "T",
    description: "D",
    imageAlt: "Alt",
    path: "/en/",
    siteUrl: "",
  });
  const keys = tags.map((m) => m.key);
  for (const gone of ["og:url", "og:image", "og:image:width", "og:image:height", "og:image:alt"]) {
    assert.ok(!keys.includes(gone), gone);
  }
  for (const kept of ["og:type", "og:site_name", "og:title", "og:description", "og:locale", "twitter:card"]) {
    assert.ok(keys.includes(kept), kept);
  }
});

test("robots.txt: a test build lets in only Facebook's preview bot; production is unchanged", () => {
  assert.equal(robotsTxt(false), "User-agent: *\nAllow: /\n");
  const test = robotsTxt(true);
  assert.equal(test, "User-agent: facebookexternalhit\nAllow: /\n\nUser-agent: *\nDisallow: /\n");
  // Exactly one Allow, and it is in Facebook's group.
  assert.equal(test.match(/Allow: \//g)?.length, 1);
  assert.match(test, /User-agent: \*\nDisallow: \/\n$/);
});

// ---- Real builds ----

/** Moves a time 100 years ahead, so the build never drops the listing as past. */
const shift = (iso: string) => iso.replace(/^20(\d\d)/, (_, yy) => `21${yy}`);

/** The sample listings, moved 100 years ahead. */
function futureEvents(dir: string, edit?: (file: EventsFile) => void): string {
  const file = structuredClone(sample);
  edit?.(file);
  for (const e of file.events) {
    e.start = shift(e.start);
    if (e.end) e.end = shift(e.end);
  }
  const path = join(dir, "events.json");
  writeFileSync(path, JSON.stringify(file));
  return path;
}

function build(env: Record<string, string>, edit?: (file: EventsFile) => void): { out: string; read: (p: string) => string; done: () => void } {
  const dir = buildFolder();
  try {
    const out = astroBuild(dir, { PV_EVENTS: futureEvents(dir, edit), ...env });
    return { out, read: (p) => readFileSync(join(out, p), "utf8"), done: () => removeFolder(dir) };
  } catch (err) {
    removeFolder(dir);
    throw err;
  }
}

const decode = (s: string) =>
  s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Preview tags in a built page, as [key, content] pairs. */
function tagsIn(html: string): [string, string][] {
  const head = html.slice(0, html.indexOf("</head>"));
  return [...head.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]);
}
const one = (tags: [string, string][], key: string) => {
  const found = tags.filter(([k]) => k === key).map(([, v]) => v);
  assert.equal(found.length, 1, `${key} once`);
  return found[0];
};

const sensitive = sample.events.find((e) => e.sensitive === true || e.type === "protest_action");
const plain = sample.events.find((e) => e.sensitive !== true && e.type !== "protest_action");

test("test build with a site address: home, listing, sensitive listing, root, 404 and robots.txt", () => {
  const b = build({ PV_TEST_BUILD: "1", PV_SITE_URL: URL_ });
  try {
    // Home, in each language.
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const html = b.read(`${lang}/index.html`);
      const tags = tagsIn(html);
      assert.equal(one(tags, "og:title"), tr.setting(settings.site.name));
      assert.equal(one(tags, "og:description"), tr.t("og.description", { city: cityName(tr, settings) }));
      assert.equal(one(tags, "og:url"), `${URL_}/${lang}/`);
      assert.equal(one(tags, "og:image"), `${URL_}/og/${lang}.png`);
      assert.equal(one(tags, "og:image:alt"), tr.t("og.image_alt", { city: cityName(tr, settings) }));
      assert.equal(one(tags, "og:locale"), `${lang}_US`);
      assert.equal(one(tags, "twitter:card"), "summary_large_image");
      assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    }

    // Listing pages, plain and sensitive (decision 0014, owner Q38): the same
    // preview as the home page in that language, apart from og:url. No
    // title, date, organization or other listing detail in any meta tag.
    const en = i18n.translator("en");
    assert.ok(plain, "the sample has a plain listing");
    assert.ok(sensitive, "the sample has a sensitive listing");
    for (const listing of [plain, sensitive]) {
      for (const lang of ["en", "es"]) {
        const tr = i18n.translator(lang);
        const html = b.read(`${lang}/listing/${listing.id}/index.html`);
        const tags = tagsIn(html);
        const home = tagsIn(b.read(`${lang}/index.html`));
        const notUrl = (t: [string, string][]) => t.filter(([k]) => k !== "og:url");
        assert.deepEqual(notUrl(tags), notUrl(home), `${lang} ${listing.id}: same as home`);
        assert.equal(one(tags, "og:url"), `${URL_}/${lang}/listing/${listing.id}/`);
        // og:title is always there, so Facebook never falls back to <title>.
        assert.equal(one(tags, "og:title"), tr.setting(settings.site.name));
        assert.match(html, /<meta name="robots" content="noindex, nofollow"/);

        const details = [
          listing.title,
          listing.org_name,
          listing.start,
          shift(listing.start),
          tr.formatDate(shift(listing.start)),
          listing.address,
          listing.neighborhood_or_town,
          listing.signup_url,
        ].filter((d): d is string => typeof d === "string" && d.length > 0);
        const head = decode(html.slice(0, html.indexOf("</head>")));
        const metas = [...head.matchAll(/<meta [^>]*>/g)].map((m) => m[0]).filter((m) => !m.includes('property="og:url"'));
        for (const meta of metas) {
          for (const d of details) assert.ok(!meta.includes(d), `${lang} ${listing.id}: "${d}" is not in ${meta}`);
        }
      }
    }

    // Root language picker and 404: home-style, in English.
    for (const page of ["index.html", "404.html"]) {
      const tags = tagsIn(b.read(page));
      assert.equal(one(tags, "og:title"), en.setting(settings.site.name), page);
      assert.equal(one(tags, "og:description"), en.t("og.description", { city: "Philadelphia" }), page);
      assert.equal(one(tags, "og:locale"), "en_US", page);
      assert.equal(one(tags, "og:image"), `${URL_}/og/en.png`, page);
      assert.equal(one(tags, "og:url"), `${URL_}/`, page);
    }

    assert.equal(b.read("robots.txt"), robotsTxt(true));
  } finally {
    b.done();
  }
});

test("normal build with no site address: no og:url or og:image anywhere; robots.txt lets everyone in", () => {
  const b = build({});
  try {
    for (const page of ["index.html", "404.html", "en/index.html", "es/index.html", `en/listing/${plain!.id}/index.html`]) {
      const tags = tagsIn(b.read(page));
      const keys = tags.map(([k]) => k);
      assert.ok(keys.includes("og:title"), page);
      assert.ok(!keys.some((k) => k === "og:url" || k.startsWith("og:image")), page);
      assert.doesNotMatch(b.read(page), /noindex/, page);
    }
    assert.equal(b.read("robots.txt"), "User-agent: *\nAllow: /\n");
  } finally {
    b.done();
  }
});

test("card place line: screen readers hear the comma form; the dotted form is hidden from them", () => {
  const b = build({});
  try {
    const pair = sample.events.find((e) => e.section === "river-wards" && e.neighborhood_or_town === "Kensington");
    assert.ok(pair, "the sample has a River Wards, Kensington listing");
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const html = b.read(`${lang}/index.html`);
      const card = html.slice(html.indexOf(`/${lang}/listing/${pair.id}/`));
      const line = card.slice(0, card.indexOf("</p>", card.indexOf("Kensington")) + 4);
      const vars = { section: "River Wards", neighborhood: "Kensington" };
      const shown = tr.t("listing.place_pair", vars);
      const spoken = tr.t("listing.place_pair_spoken", vars);
      assert.equal(spoken, "River Wards, Kensington");
      assert.match(line, new RegExp(`<span aria-hidden="true"[^>]*>${shown}</span>`));
      assert.match(line, new RegExp(`<span class="sr-only"[^>]*>${spoken}</span>`));
    }
  } finally {
    b.done();
  }
});

test("cards show the hosting organization as it writes it, marked with the listing's language", () => {
  const LONG = "Schuylkill Center for Environmental Education";
  const longId = sample.events[0].id;
  const b = build({}, (file) => {
    file.events[0].org_name = LONG;
  });
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const html = b.read(`${lang}/index.html`);
      // Every card, sensitive ones too, has the line, right under the title.
      for (const e of sample.events) {
        const start = html.indexOf(`data-listing-id="${e.id}"`);
        assert.ok(start > 0, `${lang}: card ${e.id}`);
        const card = html.slice(start, html.indexOf("</article>", start));
        const org = e.id === longId ? LONG : e.org_name;
        const [before, after] = tr.t("listing.hosted_by").split("{org}");
        const line = card.match(/<p class="card__line card__host[^"]*"[^>]*>([\s\S]*?)<\/p>/);
        assert.ok(line, `${lang} ${e.id}: host line`);
        assert.equal(decode(line[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(), `${before}${org}${after}`.trim());
        // The name carries the listing's own language, like the title.
        assert.match(line[1], new RegExp(`<span lang="${e.listing_language}"[^>]*>${org.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span>`));
        // Under the title and before the time and place lines.
        assert.ok(card.indexOf("card__title") < card.indexOf("card__host"));
        assert.ok(card.indexOf("card__host") < card.indexOf('name="clock"') || card.indexOf("card__host") < card.indexOf("<time"));
        // Not part of the link's name: the link holds the title only.
        const link = card.match(/<a class="card__link"[^>]*>([\s\S]*?)<\/a>/);
        assert.ok(link && !link[1].includes(org), `${lang} ${e.id}: link name is the title only`);
      }
    }
    // Long names wrap: the host line may break anywhere and is never clipped to one line.
    const css = readFileSync(new URL("../src/components/ui/ListingCard.astro", import.meta.url), "utf8");
    const rule = css.match(/\.card__host(?:,\s*\.card__fact)?\s*\{([^}]*)\}/);
    assert.ok(rule, "card__host has a style rule");
    assert.match(rule[1], /overflow-wrap:\s*anywhere/);
    assert.doesNotMatch(rule[1], /nowrap|ellipsis|line-clamp/);
  } finally {
    b.done();
  }
});

// ---- Flexible opportunities page (decision 0018) ----

const oppSample: OpportunitiesFile = JSON.parse(
  readFileSync(join(site, "../docs/examples/opportunities.sample.json"), "utf8"),
);

/** Writes an opportunities file to its own temporary folder; returns [path, clean-up]. */
function oppFile(file: OpportunitiesFile): [string, () => void] {
  const dir = mkdtempSync(join(tmpdir(), "pv-opp-"));
  const path = join(dir, "opportunities.json");
  writeFileSync(path, JSON.stringify(file));
  return [path, () => rmSync(dir, { recursive: true, force: true })];
}

/** The <li> for one opportunity on a built Flexible page. */
function oppCard(html: string, id: string): string {
  const start = html.indexOf(`<li data-id="${id}"`);
  assert.ok(start > 0, `card ${id}`);
  return html.slice(start, html.indexOf("</li>", start));
}
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

test("Flexible page from the public sample: each card's tag, title, host, place, join, age and time asked", () => {
  const b = build({ PV_SITE_URL: URL_ });
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const html = b.read(`${lang}/flexible/index.html`);
      assert.match(html, new RegExp(`<h1[^>]*>${tr.t("flexible.title")}</h1>`));
      assert.match(html, /id="filters-toggle"/, "the Filters button is there");
      assert.ok(html.includes(tr.plural("flexible.count", oppSample.opportunities.length)));
      for (const o of oppSample.opportunities) {
        const card = oppCard(html, o.id);
        const words = text(card);
        assert.ok(words.includes(tr.t("flexible.tag")), "Flexible tag");
        // Title links out to the organization's page, in the listing's language, title only.
        const link = card.match(/<a class="card__link" href="([^"]+)" lang="([^"]+)" rel="noopener"[^>]*>([\s\S]*?)<\/a>/);
        assert.ok(link, `${o.id}: title link`);
        assert.equal(link[1], o.signup_url);
        // Screen readers hear that it opens the organization's site, not just sighted users.
        assert.match(card, /<a class="card__link"[^>]*aria-describedby="external-note"/);
        assert.equal(link[2], o.listing_language);
        assert.equal(text(link[3]), o.title);
        assert.ok(card.includes(`<span lang="${o.listing_language}"`) && words.includes(o.org_name), "Hosted by, marked");
        assert.ok(words.includes(tr.t(`filters.join.${o.join_method}`)), "how to join");
        if (o.min_age !== null) assert.ok(words.includes(tr.t("listing.min_age", { age: o.min_age })), "minimum age");
        if (o.commitment) {
          assert.ok(card.includes(`<span lang="${o.listing_language}"`), "commitment marked with its language");
          assert.ok(words.includes(tr.t("flexible.commitment", { commitment: o.commitment })), "time asked");
        } else {
          assert.ok(!words.includes(tr.t("flexible.commitment", { commitment: "" }).trim()), "no empty time-asked line");
        }
        // No date or time on a flexible card and no heart; it has a share icon (decision 0027).
        assert.doesNotMatch(card, /<time|icon-clock|data-save-id/);
        assert.match(card, /data-share-url=/);
      }
      const note = html.match(/<p id="external-note"[^>]*>([^<]*)<\/p>/);
      assert.ok(note, "the note the links point at is on the page, once");
      assert.equal(html.split('id="external-note"').length, 2);
      assert.equal(decode(note[1]), tr.t("listing.external_note"));
      // Section and neighborhood: the dotted line hidden, the comma form spoken.
      const shelter = oppCard(html, "sample-shelter-dog-outings");
      const vars = { section: tr.setting(settings.sections!.find((s) => s.id === "river-wards")!.name), neighborhood: "Fishtown" };
      assert.ok(shelter.includes(`<span aria-hidden="true"`) && shelter.includes(tr.t("listing.place_pair", vars)));
      assert.match(shelter, new RegExp(`<span class="sr-only"[^>]*>${tr.t("listing.place_pair_spoken", vars)}</span>`));
      // Previews are the site's own, like every page (Q38).
      const tags = tagsIn(html);
      assert.equal(one(tags, "og:title"), tr.setting(settings.site.name));
      assert.equal(one(tags, "og:url"), `${URL_}/${lang}/flexible/`);
      // The home page links here.
      assert.ok(b.read(`${lang}/index.html`).includes(`href="/${lang}/flexible/"`));
    }
  } finally {
    b.done();
  }
});

test("Flexible filters: part of the city, cause and how to join, only with choices that exist", () => {
  const file = structuredClone(oppSample);
  file.opportunities[1].section = "west";
  const [path, done] = oppFile(file);
  const b = build({ PV_OPPORTUNITIES: path });
  try {
    const html = b.read("en/flexible/index.html");
    const panel = html.slice(html.indexOf('id="filter-panel"'), html.indexOf("</section>", html.indexOf('id="filter-panel"')));
    const options = (name: string) =>
      [...(panel.match(new RegExp(`data-filter="${name}"[\\s\\S]*?</select>`))?.[0] ?? "").matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    // In the settings' order, only those some opportunity uses.
    const used = (list: string[], values: Array<string | null | undefined>) => list.filter((id) => values.includes(id));
    assert.deepEqual(options("section"), ["", ...used(settings.sections!.map((s) => s.id), file.opportunities.map((o) => o.section))]);
    assert.ok(options("section").includes("west"));
    assert.deepEqual(options("cause"), ["", ...used(settings.causes, file.opportunities.map((o) => o.cause))]);
    assert.deepEqual(options("join"), ["", "drop_in", "signup", "application", "unknown"]);
    assert.doesNotMatch(panel, /data-filter="(day|time|area|type|host)"/);
    assert.match(html, /data-section="west"/);
  } finally {
    b.done();
    done();
  }
});

test("Flexible page with no opportunities: a plain message, no filters", () => {
  const [path, done] = oppFile({ generated_at: "2026-11-05T06:00:00-05:00", opportunities: [] });
  const b = build({ PV_OPPORTUNITIES: path });
  try {
    for (const lang of ["en", "es"]) {
      const html = b.read(`${lang}/flexible/index.html`);
      assert.ok(text(html).includes(i18n.translator(lang).t("flexible.none")));
      assert.doesNotMatch(html, /id="filters-toggle"|id="filter-panel"|<li data-id=/);
    }
  } finally {
    b.done();
    done();
  }
});

test("Flexible page: campaigns switched off leave no campaign opportunity in the build", () => {
  const file = structuredClone(oppSample);
  file.opportunities[0].type = "campaign";
  const [path, done] = oppFile(file);
  const settingsPath = join(path, "..", "settings.json");
  writeFileSync(settingsPath, JSON.stringify({ ...settings, features: { ...settings.features, campaigns: false } }));
  const b = build({ PV_OPPORTUNITIES: path, PV_SETTINGS: settingsPath });
  try {
    const html = b.read("en/flexible/index.html");
    assert.ok(!html.includes(file.opportunities[0].id) && !html.includes(file.opportunities[0].title));
    assert.ok(html.includes(file.opportunities[1].id));
  } finally {
    b.done();
    done();
  }
});

test("Flexible page: a named opportunities file that is missing stops the build plainly", () => {
  assert.throws(
    () => build({ PV_OPPORTUNITIES: join(tmpdir(), "pv-no-such-folder", "opportunities.json") }),
    (err: Error & { stderr?: Buffer }) => /Cannot read the opportunities file/.test(String(err.stderr ?? err.message)),
  );
});

test("Flexible cards: long names and long time-asked text wrap; nothing is cut off", () => {
  const css = readFileSync(new URL("../src/components/ui/ListingCard.astro", import.meta.url), "utf8");
  const rule = css.match(/\.card__host,\s*\.card__fact\s*\{([^}]*)\}/);
  assert.ok(rule, "host and fact lines share the wrapping rule");
  assert.match(rule[1], /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule[1], /nowrap|ellipsis|line-clamp/);
});

test("Flexible, Teams and home cards: background-check and training lines show when required (owner Q81)", () => {
  const file = structuredClone(oppSample);
  const team = file.opportunities.find((o) => o.team_required === true)!;
  const plain = file.opportunities.find((o) => o !== team)!;
  for (const o of file.opportunities) {
    o.clearances_required = false;
    o.training_required = false;
  }
  team.clearances_required = true;
  team.training_required = true;
  plain.clearances_required = true;
  const [path, done] = oppFile(file);
  // A dated Volunteer Team listing too, for the Teams page.
  let datedId = "";
  const b = build({ PV_OPPORTUNITIES: path }, (events) => {
    const d = events.events.find((e) => e.team_required === true)!;
    d.clearances_required = true;
    d.training_required = false;
    datedId = d.id;
  });
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const checks = tr.t("listing.clearances_required");
      const training = tr.t("listing.training_required");
      const flexible = b.read(`${lang}/flexible/index.html`);
      const home = b.read(`${lang}/index.html`);
      for (const html of [flexible, home]) {
        assert.ok(text(oppCard(html, plain.id)).includes(checks), `${plain.id}: background checks`);
        assert.ok(!text(oppCard(html, plain.id)).includes(training), `${plain.id}: no training line when not required`);
        assert.ok(text(oppCard(html, team.id)).includes(checks) && text(oppCard(html, team.id)).includes(training));
        for (const o of file.opportunities.filter((x) => x !== plain && x !== team)) {
          assert.ok(!text(oppCard(html, o.id)).includes(checks), `${o.id}: no background-check line when not required`);
        }
      }
      const teams = b.read(`${lang}/teams/index.html`);
      assert.ok(text(oppCard(teams, team.id)).includes(checks) && text(oppCard(teams, team.id)).includes(training));
      assert.ok(text(oppCard(teams, datedId)).includes(checks), "dated team card: background checks");
      assert.ok(!text(oppCard(teams, datedId)).includes(training), "dated team card: no training line");
    }
  } finally {
    b.done();
    done();
  }
});

// ---- Volunteer Teams (decision 0020) ----

test("Volunteer Teams page: dated and arranged team activities, each with the tag, size, task, host, place and join", () => {
  const b = build({ PV_SITE_URL: URL_ });
  try {
    const dated = sample.events.filter((e) => e.team_required === true);
    const arranged = oppSample.opportunities.filter((o) => o.team_required === true);
    assert.ok(dated.length > 0 && arranged.length > 0, "the samples have both kinds");
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const html = b.read(`${lang}/teams/index.html`);
      assert.match(html, new RegExp(`<h1[^>]*>${tr.t("teams.title")}</h1>`));
      assert.ok(html.includes(tr.plural("teams.count", dated.length + arranged.length)));
      assert.match(html, /id="filters-toggle"/);
      assert.match(html, /data-storage-key="cvh\.filters\.teams"/);
      // Dated ones first.
      assert.ok(html.indexOf(`data-id="${dated[0].id}"`) < html.indexOf(`data-id="${arranged[0].id}"`));
      for (const item of [...dated, ...arranged]) {
        const card = oppCard(html, item.id);
        const words = text(card);
        assert.ok(words.includes(tr.t("teams.tag")), "Volunteer Team tag");
        assert.ok(words.includes(tr.t("teams.size", { size: item.team_size! })), "team size");
        assert.ok(words.includes(tr.t("teams.task", { task: item.team_task! })), "team task");
        // Size and task are the organization's own words, marked with its language.
        const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        for (const value of [item.team_size!, item.team_task!]) {
          assert.match(card, new RegExp(`<span lang="${item.listing_language}"[^>]*>${esc(value)}</span>`), value);
        }
        assert.ok(words.includes(item.org_name), "host");
        assert.ok(words.includes(tr.t(`filters.join.${item.join_method}`)), "how to join");
        if (item.section) assert.ok(card.includes('class="sr-only"'), "spoken place line");
      }
      // A dated one links to our listing page and shows its time; an arranged one links out.
      const d = oppCard(html, dated[0].id);
      assert.match(d, new RegExp(`href="/${lang}/listing/${dated[0].id}/"`));
      assert.match(d, /<time /);
      const a = oppCard(html, arranged[0].id);
      assert.match(a, new RegExp(`href="${arranged[0].signup_url}"[^>]*rel="noopener"[^>]*aria-describedby="external-note"`));
      assert.ok(text(a).includes(tr.t("flexible.tag")));
      // Site-only previews, own address.
      assert.equal(one(tagsIn(html), "og:url"), `${URL_}/${lang}/teams/`);
      assert.equal(one(tagsIn(html), "og:title"), tr.setting(settings.site.name));
      // Linked from the home page.
      assert.ok(b.read(`${lang}/index.html`).includes(`href="/${lang}/teams/"`));
    }
  } finally {
    b.done();
  }
});

test("calendar: Volunteer Team tag on cards and listing pages", () => {
  const b = build({});
  try {
    const team = sample.events.find((e) => e.team_required === true)!;
    const other = sample.events.find((e) => e.team_required !== true)!;
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const home = b.read(`${lang}/index.html`);
      const card = (id: string) => home.slice(home.indexOf(`<li data-id="${id}"`), home.indexOf("</li>", home.indexOf(`<li data-id="${id}"`)));
      assert.match(card(team.id), /data-team="true"/);
      assert.ok(text(card(team.id)).includes(tr.t("teams.tag")));
      assert.match(card(other.id), /data-team="false"/);
      assert.ok(!text(card(other.id)).includes(tr.t("teams.tag")));
      // Only the page's own content: the header links to "Volunteer Teams" on every page.
      const mainOf = (html: string) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
      const page = text(mainOf(b.read(`${lang}/listing/${team.id}/index.html`)));
      assert.ok(page.includes(tr.t("teams.tag")));
      assert.ok(page.includes(tr.t("teams.size", { size: team.team_size! })));
      assert.ok(page.includes(tr.t("teams.task", { task: team.team_task! })));
      assert.ok(!text(mainOf(b.read(`${lang}/listing/${other.id}/index.html`))).includes(tr.t("teams.tag")));
    }
  } finally {
    b.done();
  }
});

test("home page: Kind filter, flexible cards in the list (hidden until chosen), By Date, Flexible and Team row under the heading", () => {
  const b = build({});
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const home = b.read(`${lang}/index.html`);
      const main = home.slice(home.indexOf("<main"), home.indexOf("</main>"));
      // The By Date · Flexible Shifts · Team Shifts row (tested in the header test); no calculator link at the top.
      const top = main.slice(0, main.indexOf('id="listing-list"'));
      const outsidePanel = top.replace(/<section id="filter-panel"[\s\S]*?<\/section>/, "");
      assert.ok(!outsidePanel.includes(`href="/${lang}/medicaid-hours/"`), `${lang}: no calculator link at the top`);
      // Kind comes first in the panel, with the three choices and the two page links.
      const panel = home.slice(home.indexOf('id="filter-panel"'), home.indexOf("</section>", home.indexOf('id="filter-panel"')));
      assert.ok(panel.indexOf('id="filter-kind"') < panel.indexOf('id="filter-day"'));
      const kind = panel.slice(panel.indexOf('id="filter-kind"'), panel.indexOf("</select>", panel.indexOf('id="filter-kind"')));
      assert.deepEqual([...kind.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)/g)].map((m) => [m[1], decode(m[2])]), [
        ["", tr.t("filters.kind.dated")],
        ["flexible", tr.t("filters.kind.flexible")],
        ["teams", tr.t("filters.kind.teams")],
      ]);
      // The panel links to the Flexible and Teams pages are gone (owner, 2026-11-10); those links sit under the Filters button.
      assert.ok(!panel.includes(`href="/${lang}/flexible/"`) && !panel.includes(`href="/${lang}/teams/"`));
      // Owner, 2026-11-10: "Shift" with By Date, Flexible, Teams.
      if (lang === "en") assert.deepEqual([tr.t("filters.kind.label"), tr.t("filters.kind.dated"), tr.t("filters.kind.flexible"), tr.t("filters.kind.teams")], ["Shift", "By Date", "Flexible", "Teams"]);
      assert.doesNotMatch(panel, /id="filter-team"/, "the old team filter is folded into Kind");
      // Day and time are marked so the script can switch them off for flexible items.
      assert.equal([...panel.matchAll(/data-dated-only/g)].length, 3);
      // Every flexible opportunity is in the list, hidden until Kind asks for it, with the Flexible card style.
      for (const o of oppSample.opportunities) {
        const li = home.slice(home.indexOf(`<li data-id="${o.id}"`), home.indexOf("</li>", home.indexOf(`<li data-id="${o.id}"`)));
        assert.match(li, /data-kind="flexible"/);
        assert.match(li, /\shidden[\s>]/);
        assert.match(li, /aria-describedby="external-note"/);
        assert.ok(text(li).includes(tr.t("flexible.tag")));
      }
      assert.match(home, /<p id="external-note"[^>]*hidden/);
      // Empty-state words for each kind are on the page for the script.
      for (const [attr, key] of [
        ["data-empty-flexible", "flexible.none"],
        ["data-empty-teams", "teams.none"],
        ["data-empty-dated", "results.empty"],
      ]) {
        assert.ok(home.includes(`${attr}="${tr.t(key).replace(/'/g, "&#39;")}"`) || decode(home).includes(`${attr}="${tr.t(key)}"`), `${lang} ${attr}`);
      }
    }
  } finally {
    b.done();
  }
});

test("header as before (1715dec): logo, About, languages; footer: calculator, Dark mode switch, sources; By Date · Flexible · Team row (owner, 2026-11-10)", () => {
  const b = build({});
  const t = build({ PV_TEST_BUILD: "1" });
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const calc = tr.t("medicaid.link_with_date", { date: new Intl.DateTimeFormat(lang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date("2027-01-01T12:00:00Z")) });
      for (const page of ["index.html", "flexible/index.html", "teams/index.html", "about/index.html"]) {
        const html = b.read(`${lang}/${page}`);
        const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
        // Logo, then About, then the language switch; no other page links up here.
        assert.ok(header.indexOf("site-header__name") < header.indexOf("site-header__about"), page);
        assert.ok(header.indexOf("site-header__about") < header.indexOf("lang-switch"), page);
        const beforeLanguages = header.slice(0, header.indexOf("lang-switch"));
        assert.deepEqual([...beforeLanguages.matchAll(/<a[^>]*href="(\/[a-z]{2}\/[^"]*)"/g)].map((m) => m[1]), [`/${lang}/`, `/${lang}/about/`], page);
        // Footer: the calculator link with its date, the Dark mode switch (hidden until its script runs), the sources line.
        const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
        assert.ok(text(footer).includes(calc), `${lang} ${page}: calculator link`);
        assert.match(footer, new RegExp(`<button type="button" class="theme-switch[^"]*" aria-pressed="false" data-theme-toggle hidden[^>]*>[\\s\\S]*?${tr.t("site.theme_dark")}`));
        assert.ok(text(footer).includes(tr.t("site.footer_sources")), page);
      }
      // A test build: the footer is back (calculator and switch); the sources line is in the banner instead.
      const home = t.read(`${lang}/index.html`);
      const tf = home.slice(home.indexOf("<footer"), home.indexOf("</footer>"));
      assert.ok(home.includes("<footer") && text(tf).includes(calc));
      assert.ok(!text(tf).includes(tr.t("site.footer_sources")));
      const banner = home.match(/<div class="test-banner[^"]*"[^>]*>([\s\S]*?)<\/div>/)![1];
      assert.ok(text(banner).includes(tr.t("site.footer_sources")));
      // By Date · Flexible Shifts · Team Shifts under the heading; the page you are on is not a link.
      for (const [page, current] of [["index.html", "home.dated_link"], ["flexible/index.html", "home.flexible_link"], ["teams/index.html", "home.teams_link"]]) {
        const html = b.read(`${lang}/${page}`);
        const row = html.slice(html.indexOf('<ul class="page-tabs'), html.indexOf("</ul>", html.indexOf('<ul class="page-tabs')));
        assert.ok(html.indexOf('class="page-tabs') > html.indexOf('id="results-heading"'), "under the heading");
        assert.deepEqual([...row.matchAll(/>([^<>]+)<\/(?:a|span)>/g)].map((m) => decode(m[1])), [tr.t("home.dated_link"), tr.t("home.flexible_link"), tr.t("home.teams_link")]);
        assert.match(row, new RegExp(`<span class="page-tabs__current"[^>]*aria-current="page"[^>]*>${tr.t(current)}</span>`), `${lang} ${page}`);
        assert.equal((row.match(/<a /g) ?? []).length, 2, `${lang} ${page}: two links, the current one is not`);
      }
    }
  } finally {
    b.done();
    t.done();
  }
});

test("Volunteer Teams: with none, a plain message and no filters; no team filter on the calendar either", () => {
  const [path, done] = oppFile({ generated_at: "2026-11-05T06:00:00-05:00", opportunities: [] });
  const b = build({ PV_OPPORTUNITIES: path }, (file) => {
    for (const e of file.events) e.team_required = false;
  });
  try {
    for (const lang of ["en", "es"]) {
      const html = b.read(`${lang}/teams/index.html`);
      assert.ok(text(html).includes(i18n.translator(lang).t("teams.none")));
      assert.doesNotMatch(html, /id="filters-toggle"|id="filter-panel"|<li data-id=/);
    }
  } finally {
    b.done();
    done();
  }
});

test("Volunteer Teams words never say 'group' (decision 0020)", () => {
  for (const [lang, word] of [["en", /group/i], ["es", /grupo/i]] as const) {
    const all = JSON.parse(readFileSync(join(site, `src/i18n/${lang}.json`), "utf8"));
    for (const value of [...Object.values(all.teams), ...Object.values(all.filters.kind)].flatMap((v) => (typeof v === "string" ? [v] : Object.values(v as object)))) {
      assert.doesNotMatch(String(value), word, `${lang}: ${value}`);
    }
  }
});

test("a Volunteer Team listing never also says 'Good for groups'; other listings still can (owner, 2026-11-08)", () => {
  const team = sample.events.find((e) => e.team_required === true)!;
  const plainId = sample.events.find((e) => e.team_required !== true)!.id;
  const b = build({}, (file) => {
    // Both say group_friendly, so only team_required makes the difference.
    for (const e of file.events) if (e.id === team.id || e.id === plainId) e.group_friendly = true;
  });
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const groups = tr.t("listing.group_friendly");
      assert.ok(!text(b.read(`${lang}/listing/${team.id}/index.html`)).includes(groups), `${lang}: team listing page`);
      assert.ok(text(b.read(`${lang}/listing/${plainId}/index.html`)).includes(groups), `${lang}: other listing page still shows it`);
      // Cards on the home page and the Teams page never show it.
      assert.ok(!text(b.read(`${lang}/index.html`)).includes(groups), `${lang}: home cards`);
      assert.ok(!text(b.read(`${lang}/teams/index.html`)).includes(groups), `${lang}: Teams page`);
    }
  } finally {
    b.done();
  }
});

// ---- About page (decision 0025) ----

test("About page: nine sections in order, each with its drawing, heading and words", () => {
  const b = build({ PV_SITE_URL: URL_ });
  try {
    const order = ["shifts", "near-you", "everyone", "private", "more", "rewards", "why", "support", "contact"];
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const html = b.read(`${lang}/about/index.html`);
      const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
      assert.deepEqual([...main.matchAll(/data-art="([^"]+)"/g)].map((m) => m[1]), order);
      assert.doesNotMatch(main, /data-placeholder/, "the real drawings, not placeholders");
      for (const m of main.matchAll(/<div class="about-art"[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/);
      assert.equal([...main.matchAll(/<svg/g)].length, 9);
      const h2 = [...main.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => decode(m[1]));
      assert.deepEqual(h2, [
        tr.t("about_page.shifts.heading"),
        tr.t("about_page.near_you.heading"),
        tr.t("about_page.everyone.heading"),
        tr.t("about_page.private.heading"),
        tr.t("about_page.more.heading"),
        tr.t("about_page.rewards.heading"),
        tr.t("about_page.why.heading"),
        tr.t("about_page.support.heading"),
        tr.t("about_page.contact.heading"),
      ]);
      // No totals file in this build (PV_STATS not set): the "to date" line is left out.
      assert.doesNotMatch(main, /about__numbers/);
      // Links to the calendar, the three other pages and the contact address.
      for (const href of [`/${lang}/`, `/${lang}/flexible/`, `/${lang}/teams/`, `/${lang}/medicaid-hours/`, `mailto:${settings.site.contact_email}`]) {
        assert.ok(main.includes(`href="${href}"`), `${lang}: link ${href}`);
      }
      // The new bullets: the calculator link with the rule's year from its settings, and the City line.
      assert.match(main, new RegExp(`<a href="/${lang}/medicaid-hours/"[^>]*>[^<]*2027`));
      for (const key of ["why.one_place", "why.spanish", "support.sponsors"]) {
        assert.ok(text(main).includes(tr.t(`about_page.${key}`)), key);
      }
      // The city's name comes from the settings (the area the sections belong to).
      const office = tr.t("about_page.support.office", { city: cityName(tr, settings) });
      assert.ok(text(main).includes(office), office);
      if (lang === "en") assert.ok(office.startsWith("The City of Philadelphia: please share your volunteer programs"));
      // The header links here from every page (owner, 2026-11-10: page links moved from the footer).
      for (const page of [`${lang}/index.html`, `${lang}/flexible/index.html`, `${lang}/medicaid-hours/index.html`]) {
        const p = b.read(page);
        assert.ok(p.slice(0, p.indexOf("<main")).includes(`href="/${lang}/about/"`), `header link on ${page}`);
      }
      // Previews are the site's own (Q38); the handout line names the page's address.
      const tags = tagsIn(html);
      assert.equal(one(tags, "og:title"), tr.setting(settings.site.name));
      assert.equal(one(tags, "og:image"), `${URL_}/og/${lang}.png`);
      assert.equal(one(tags, "og:url"), `${URL_}/${lang}/about/`);
      assert.ok(text(main).includes(`${URL_}/${lang}/about/`));
    }
  } finally {
    b.done();
  }
});

test("About page 'to date' line from the running totals file (PV_STATS): numbers only, never the file's note", () => {
  const dir = mkdtempSync(join(tmpdir(), "pv-stats-"));
  const stats = join(dir, "listings-ledger.json");
  const note = "Tracking began 2026-11-09, a private note that must never reach the page.";
  writeFileSync(stats, JSON.stringify({ version: 4, tracking_began: "2026-11-09", note, totals: { shifts: 459, cards: 59, organizations: 86, neighborhoods: 35 } }));
  const b = build({ PV_STATS: stats });
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const main = text(b.read(`${lang}/about/index.html`));
      const expected = tr.t("about_page.shifts.numbers_to_date", {
        opportunities: tr.plural("about_page.shifts.listings", 518), // 459 shifts + 59 cards
        organizations: tr.plural("about_page.shifts.organizations", 86),
        neighborhoods: tr.plural("about_page.shifts.neighborhoods", 35),
      });
      assert.ok(main.includes(expected), `${lang}: ${expected}`);
      if (lang === "en") assert.ok(main.includes("To date, the calendar has listed 518 volunteer opportunities from 86 organizations in 35 neighborhoods."));
      for (const page of ["about/index.html", "index.html"]) assert.ok(!b.read(`${lang}/${page}`).includes("Tracking began"), "the note never shows");
    }
  } finally {
    b.done();
  }
  // A named file that is missing, or a total that is not a whole number, stops the build.
  writeFileSync(stats, JSON.stringify({ version: 4, totals: { shifts: 1, cards: "many", organizations: 1, neighborhoods: 1 } }));
  assert.throws(() => build({ PV_STATS: stats }), (err: { stderr?: Buffer }) => /totals\.cards/.test(String(err.stderr ?? err)));
  assert.throws(() => build({ PV_STATS: join(dir, "missing.json") }));
  rmSync(dir, { recursive: true, force: true });
});

test("About page words: plain, no typed-in numbers, no 'just' or 'simply', prints section by section", () => {
  const walk = (o: unknown): string[] =>
    typeof o === "string" ? [o] : Object.values(o as Record<string, unknown>).flatMap(walk);
  for (const lang of ["en", "es"]) {
    const words = walk(JSON.parse(readFileSync(join(site, `src/i18n/${lang}.json`), "utf8")).about_page);
    for (const w of words) {
      assert.doesNotMatch(w, /\d/, `${lang}: no numbers typed into the words: ${w}`);
      if (lang === "en") assert.doesNotMatch(w, /\b(just|simply|obviously)\b/i, w);
    }
  }
  const page = readFileSync(join(site, "src/pages/[lang]/about/index.astro"), "utf8");
  const print = page.slice(page.indexOf("@media print"));
  assert.match(print, /\.about__section\s*\{[^}]*break-inside: avoid/);
  assert.match(print, /body > \*:not\(main\)/);
});

test("the link to the page you are on is marked aria-current=page in the header", () => {
  const b = build({});
  try {
    for (const lang of ["en", "es"]) {
      const current = (page: string) =>
        [...b.read(page).matchAll(/<a[^>]*aria-current="page"[^>]*href="([^"]+)"|<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)]
          .map((m) => m[1] ?? m[2])
          .filter((href) => !href.startsWith("/" + (lang === "en" ? "es" : "en") + "/")); // language switch marks its own
      assert.deepEqual(current(`${lang}/about/index.html`), [`/${lang}/about/`]);
      assert.deepEqual(current(`${lang}/teams/index.html`), [], "no header link to Teams any more");
      assert.deepEqual(current(`${lang}/medicaid-hours/index.html`), [`/${lang}/medicaid-hours/`]);
      assert.deepEqual(current(`${lang}/index.html`), [`/${lang}/`]);
      assert.deepEqual(current(`${lang}/flexible/index.html`), [], "no header link to Flexible any more");
      assert.deepEqual(current(`${lang}/listing/${sample.events[0].id}/index.html`), []);
    }
  } finally {
    b.done();
  }
});

test("the 'rewards are coming' line is gone from every page (owner, 2026-11-08)", () => {
  const b = build({});
  try {
    for (const lang of ["en", "es"]) {
      for (const page of [`${lang}/index.html`, `${lang}/about/index.html`, `${lang}/flexible/index.html`, `${lang}/listing/${sample.events[0].id}/index.html`]) {
        const html = b.read(page);
        assert.doesNotMatch(html, /rewards-coming|rewards_coming/, page);
        assert.ok(!html.includes(lang === "en" ? "Rewards for volunteering are coming" : "Las recompensas por hacer voluntariado llegan pronto"), page);
      }
    }
  } finally {
    b.done();
  }
});

test("Filters button sits beside the page heading, not in the site header (owner, 2026-11-08)", () => {
  const b = build({});
  try {
    for (const lang of ["en", "es"]) {
      for (const page of [`${lang}/index.html`, `${lang}/flexible/index.html`, `${lang}/teams/index.html`]) {
        const html = b.read(page);
        const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
        assert.doesNotMatch(header, /filters-toggle/, `${page}: not in the header`);
        const box = html.slice(html.indexOf('<div class="results-heading"'), html.indexOf("</button>", html.indexOf('<div class="results-heading"')));
        assert.match(box, /<h1 id="results-heading"/, `${page}: a real h1`);
        assert.ok(box.indexOf("<h1") < box.indexOf('id="filters-toggle"'), `${page}: heading first, then the button`);
        // Same name as before: "Filters" (plus the spoken count when filters are on).
        assert.match(box, new RegExp(`id="filters-toggle"[\\s\\S]*${i18n.translator(lang).t("filters.open")}`));
      }
    }
  } finally {
    b.done();
  }
});

test("Kind note is a polite live region that is always on the page; Apply follows the kind (accessibility gate)", () => {
  const b = build({});
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const home = b.read(`${lang}/index.html`);
      const note = home.match(/<p id="kind-note"[^>]*>([^<]*)<\/p>/);
      assert.ok(note, `${lang}: the note is on the page`);
      assert.match(note[0], /role="status"/);
      assert.doesNotMatch(note[0], /\shidden[\s>=]/, "never hidden");
      assert.equal(note[1].trim(), "", "empty until a kind needs a note");
      assert.match(home, /id="filter-kind"[^>]*aria-describedby="kind-note"/);
      const apply = home.match(/<button[^>]*data-filters-apply[^>]*>/)![0];
      for (const [attr, key] of [["data-label-dated", "filters.apply"], ["data-label-flexible", "flexible.apply"], ["data-label-teams", "teams.apply"]]) {
        assert.ok(decode(apply).includes(`${attr}="${tr.t(key)}"`), `${lang}: ${attr}`);
      }
    }
    // The script never hides the note; it only changes its words.
    const script = readFileSync(join(site, "src/scripts/filters.ts"), "utf8");
    assert.doesNotMatch(script, /kindNote\.hidden/);
  } finally {
    b.done();
  }
});

// ---- Share panel (decision 0027) ----

test("share: an icon on every card and the listing page, one panel per page, nothing from outside", () => {
  const b = build({});
  try {
    const sensitive = sample.events.find((e) => e.sensitive === true || e.type === "protest_action")!;
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      const pages = [`${lang}/index.html`, `${lang}/flexible/index.html`, `${lang}/teams/index.html`, `${lang}/listing/${sensitive.id}/index.html`];
      for (const page of pages) {
        const html = b.read(page);
        const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
        // Every card has a share icon; the listing page has its Share button.
        const cards = [...main.matchAll(/<article class="card/g)].length;
        const shares = [...main.matchAll(/<button[^>]*data-share-url="([^"]+)"[^>]*>/g)];
        assert.ok(shares.length >= Math.max(cards, 1), `${page}: ${shares.length} share buttons for ${cards} cards`);
        for (const m of shares) {
          for (const attr of ["data-share-title", "data-share-when", "data-share-host", "aria-haspopup=\"dialog\""]) assert.ok(m[0].includes(attr), `${page}: ${attr}`);
        }
        // One panel, labelled, with the eight choices and a status line.
        const dialog = html.slice(html.indexOf('<dialog id="share-panel"'), html.indexOf("</dialog>") + 9);
        assert.match(dialog, /aria-labelledby="share-heading"/);
        assert.ok(dialog.includes(tr.t("share.heading")));
        const targets = [...dialog.matchAll(/data-share-target="([^"]+)"/g)].map((x) => x[1]);
        assert.deepEqual(targets, ["sms", "whatsapp", "facebook", "x", "bluesky", "email"]);
        assert.match(dialog, /data-share-copy/);
        assert.match(dialog, /data-share-picture[^>]*aria-describedby="share-picture-hint"/);
        assert.match(dialog, /role="status"/);
        for (const key of ["sms", "whatsapp", "facebook", "x", "bluesky", "email", "copy", "instagram", "close"]) assert.ok(decode(dialog).includes(tr.t(`share.${key}`)), key);
        // Web links open in a new tab, say so, and pass nothing back.
        for (const a of dialog.matchAll(/<a[^>]*data-share-target="(whatsapp|facebook|x|bluesky)"[^>]*>[\s\S]*?<\/a>/g)) {
          assert.match(a[0], /target="_blank"/);
          assert.match(a[0], /rel="noopener noreferrer"/);
          assert.ok(decode(a[0]).includes(tr.t("share.new_tab")));
        }
        // No outside script, image or font: only our own files.
        assert.doesNotMatch(html, /<script[^>]*src="https?:/);
        assert.doesNotMatch(html, /<img[^>]*src="https?:/);
        assert.doesNotMatch(html, /<link[^>]*href="https?:\/\/(?!volunteer)[^"]*"[^>]*rel="(stylesheet|preload)"/);
      }
      // A flexible card shares the organization's page, which is where it links.
      const flex = b.read(`${lang}/flexible/index.html`);
      for (const o of oppSample.opportunities) {
        const li = flex.slice(flex.indexOf(`<li data-id="${o.id}"`), flex.indexOf("</li>", flex.indexOf(`<li data-id="${o.id}"`)));
        assert.ok(li.includes(`data-share-url="${o.signup_url}"`), `${lang}: ${o.id} shares its own link`);
        assert.ok(li.includes(`data-share-when="${tr.t("flexible.tag")}"`), "Flexible instead of a date");
      }
      // A sensitive listing gets the same panel and the same share button (owner).
      const page = b.read(`${lang}/listing/${sensitive.id}/index.html`);
      assert.match(page, new RegExp(`data-share-url="/${lang}/listing/${sensitive.id}/"`));
    }
  } finally {
    b.done();
  }
});

test("share scripts send nothing anywhere and store nothing", () => {
  for (const file of ["src/scripts/share-panel.ts", "src/scripts/share-picture.ts", "src/lib/share.ts"]) {
    const code = readFileSync(join(site, file), "utf8").replace(/\/\/.*$/gm, "");
    for (const banned of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "localStorage", "sessionStorage", "indexedDB", "document.cookie", "new Image(", "@font-face", "import("]) {
      assert.ok(!code.includes(banned), `${file}: no ${banned}`);
    }
  }
});

test("the saved share picture has a neutral file name, never the title (owner, Q75)", () => {
  const script = readFileSync(join(site, "src/scripts/share-panel.ts"), "utf8");
  const nameLine = script.split("\n").find((l) => l.includes("const name ="))!;
  assert.ok(nameLine, "the file name is set in one place");
  assert.doesNotMatch(nameLine, /shareTitle|title/i);
  assert.match(script, /link\.download = name;/);
  assert.match(script, /new File\(\[blob\], name,/);
  const b = build({});
  try {
    for (const [lang, expected] of [["en", "volunteer-opportunity.png"], ["es", "oportunidad-de-voluntariado.png"]]) {
      const html = b.read(`${lang}/index.html`);
      const words = JSON.parse(decode(html.match(/<dialog id="share-panel"[^>]*data-words="([^"]*)"/)![1]));
      assert.equal(words.fileName, expected);
      // No listing's title, written as a file name would write it, is in the name.
      const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      for (const e of sample.events) assert.ok(!words.fileName.includes(slug(e.title)), e.title);
    }
  } finally {
    b.done();
  }
});

// ---- Search (owner, 2026-11-08) ----

test("count and List | Map on one line, search box under them, on home, Flexible and Teams; every card has its search words in the page's language", () => {
  const b = build({});
  try {
    for (const lang of ["en", "es"]) {
      const tr = i18n.translator(lang);
      for (const [page, label] of [
        [`${lang}/index.html`, "search.label_dated"],
        [`${lang}/flexible/index.html`, "search.label_flexible"],
        [`${lang}/teams/index.html`, "search.label_teams"],
      ]) {
        const html = b.read(page);
        const bar = html.slice(html.indexOf('<div class="results__bar"'), html.indexOf('id="results-none"'));
        // One line: the count, then the List | Map switch; the search box on the next line (owner, 2026-11-10).
        const line = bar.slice(0, bar.indexOf("</div>", bar.indexOf("data-map-switch")) + 6);
        assert.ok(line.indexOf('id="results-count"') < line.indexOf("data-map-switch"), `${page}: count, then the switch`);
        assert.ok(!line.includes('id="results-search"'), `${page}: search not on the count line`);
        assert.ok(bar.indexOf("data-map-switch") < bar.indexOf('id="results-search"'), `${page}: switch, then search`);
        assert.ok(bar.indexOf('id="results-search"') < bar.indexOf("data-map-root"), `${page}: search above the map`);
        const input = bar.match(/<input[^>]*id="results-search"[^>]*>/)![0];
        assert.match(input, /type="search"/);
        assert.match(input, /autocomplete="off"/);
        assert.doesNotMatch(input, /\sname=/, "no name: nothing to submit");
        assert.match(bar, new RegExp(`<label[^>]*for="results-search"[^>]*>${tr.t(label)}</label>`));
        assert.match(bar, /<div class="search"[^>]*data-search[^>]*hidden/, "hidden until the script runs");
        assert.ok(decode(bar).includes(tr.t("search.clear")), "the clear button has a name");
        assert.doesNotMatch(html, /<form/);
      }
      // Each card's search words: title, organization, neighborhood, cause, how to join, in this language.
      const home = b.read(`${lang}/index.html`);
      const e = sample.events[0];
      const li = home.match(new RegExp(`<li data-id="${e.id}"[^>]*>`))![0];
      const words = decode(li.match(/data-search="([^"]*)"/)![1]);
      const norm = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      for (const part of [e.title, e.org_name, e.neighborhood_or_town!, tr.causeName(e.cause), tr.t(`filters.join.${e.join_method}`)]) {
        assert.ok(words.includes(norm(part)), `${lang}: ${part}`);
      }
      assert.ok(decode(home).includes(`data-search-none="${tr.t("search.none")}"`));
    }
  } finally {
    b.done();
  }
});

test("search script sends nothing, stores nothing, never changes the address", () => {
  for (const file of ["src/scripts/search.ts", "src/lib/search.ts"]) {
    const code = readFileSync(join(site, file), "utf8").replace(/\/\/.*$/gm, "");
    for (const banned of ["fetch(", "XMLHttpRequest", "sendBeacon", "localStorage", "sessionStorage", "indexedDB", "cookie", "pushState", "replaceState", "location"]) {
      assert.ok(!code.includes(banned), `${file}: no ${banned}`);
    }
  }
  // The filter scripts store only the filters, never the search words.
  for (const file of ["src/scripts/filters.ts", "src/scripts/flexible-filters.ts"]) {
    const code = readFileSync(join(site, file), "utf8");
    for (const call of code.matchAll(/writeFilters\(([^)]*)\)/g)) assert.doesNotMatch(call[1], /search|query/, `${file}: ${call[0]}`);
  }
});
