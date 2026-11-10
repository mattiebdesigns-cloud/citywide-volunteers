# Calendar site

The Phase 1 calendar: a static website built with Astro. It reads one events file and one city settings file at build time and writes plain HTML to `dist/`. There is no server and no database. Anyone can build it with the sample data in this repo, with no key and no private file.

## Build it

You need Node 22.22 or newer to build and test (Astro 7.4 requires it; `npm test` also runs TypeScript directly). Node 24 is recommended; `.nvmrc` names it.

```sh
cd site
npm ci                 # installs exactly what package-lock.json lists
npm run build          # writes dist/ using the sample listings and settings.example.json
```

Look at it on your own computer with `npm run preview`, then open the address it prints.

### Build inputs

All optional. Relative paths are read from the folder you run the command in.

| Setting | What it is | Default |
|---|---|---|
| `PV_EVENTS` | The events file (`docs/EVENT-FORMAT.md`) | `../docs/examples/events.sample.json` |
| `PV_SETTINGS` | The city settings, as JSON | `settings.example.json` |
| `PV_OPPORTUNITIES` | The flexible opportunities file (`docs/opportunities-file.schema.json`, decision 0018). Optional: a file named here must exist; with none, the default sample is used if present, otherwise the Flexible page says there are none yet | `../docs/examples/opportunities.sample.json` |
| `PV_SITE_URL` | The site's public address, for full links and link previews (below) | none |
| `PV_TEST_BUILD` | `1` makes a test build (below) | off |
| `PV_BASEMAP` | `basemap.json` made by `scripts/cut-basemap.mjs`: the street map under the map pins (decision 0035). Kept outside this repo (OpenStreetMap data, ODbL) | none: pins on a plain background |

Example, with a city's own files:

```sh
PV_EVENTS=/path/to/events.json PV_SETTINGS=/path/to/settings.json PV_SITE_URL=https://example.org npm run build
```

A city keeps its settings in its own private place. If they are in YAML, convert them to JSON first; never commit a real settings file here (`settings.json` is ignored by git).

### Test builds

`npm run build:test` (or `PV_TEST_BUILD=1`) makes a build for trying things out:

- a "Test version" line at the top of every page;
- `noindex, nofollow` on every page;
- a `robots.txt` that lets in only Facebook's link-preview bot (`facebookexternalhit`) and asks every other crawler to stay out (decision 0014).

A normal build's `robots.txt` lets every crawler in.

### Home page filters

The Filters button sits beside the page heading (heading left, button right; on a narrow screen the button wraps under the heading). The panel's first filter, **Kind**, chooses what the list shows: dated shifts (the default), flexible opportunities, or everything that needs a Volunteer Team. Flexible opportunities are in the home page's list too, hidden until Kind asks for them, so the page works without JavaScript as before. Day and time filters do not apply to flexible opportunities: with Kind set to Flexible they hide, with a note. The panel links to the full Flexible and Volunteer Teams pages; the footer links to About, Flexible, Volunteer Teams and the Medicaid hours calculator.

### Search

A search box sits beside the results count on the home, Flexible and Teams pages (on phones, under it). It matches as you type, after a short pause, against each card's title, organization, neighborhood, section, cause and how to join, in the page's language, ignoring case and accents (`src/lib/search.ts`; each card's words are built into `data-search`). It works with Kind and the other filters. The words stay in the page's memory: never sent, never stored, never in the address. Escape or the × button clears it.

### Flexible opportunities

`/en/flexible/` and `/es/flexible/` list programs with no set dates or times, where the volunteer schedules with the organization (decision 0018). They come from `PV_OPPORTUNITIES`, never from the events file, so the calendar does not change. Each card shows a "Flexible" tag, the title (linking to the organization's own page), who hosts it, the part of the city and neighborhood, how to join, the minimum age and the time asked. Filters: part of the city, cause and how to join. There is no detail page. The home page's Kind filter and the footer link here.

### Volunteer Teams

`/en/teams/` and `/es/teams/` list every activity that needs a team, not one person (`team_required` true; decision 0020): dated calendar listings first, then flexible opportunities. Cards show a "Volunteer Team" tag, the team size and task in the organization's own words, who hosts it, the place and how to join. Filters: part of the city, cause and how to join. On the calendar, team listings carry the same tag, the listing page shows the team size and task, and the filter panel has a Volunteer Teams filter (show only, or hide) when any listing needs a team.

### Medicaid hours calculator

`/en/medicaid-hours/` and `/es/medicaid-hours/` add up one month of work (or income), volunteering, a work program and school for Pennsylvania's Medicaid rule (decision 0022). It runs only in the browser: no form, no network request, no storage of any kind (the page leaves out the site's storage scripts), no analytics. Every figure, link and phone number is in `MEDICAID` in `src/lib/medicaid.ts`, with the date they were last checked; check them against Pennsylvania DHS before launch and whenever DHS publishes guidance. The checklist prints on its own and copies as plain text.

### Maps (decision 0035)

The list stays the main view. A "List | Map" switch (hidden without JavaScript) opens a map of what the list shows: on the home page one day at a time (today first, with Previous day, Next day and a date box; every other filter still applies), and on the Flexible and Teams pages every card with a place, with no day. A card with no map point stays in the list, and the map says how many have none.

- **Where pins come from.** Optional `lat`, `lon` and `approximate` on each listing (all three or none; docs/event.schema.json), worked out by the pipeline. `approximate: true` is an area's center: a dashed ring, "Approximate area" in words, and no directions. A listing with a point but no `approximate` is treated as having no point. Sensitive listings are pinned at their published place like every other (owner Q119); the map code never reads `sensitive`.
- **Pins** are real buttons on the map (`src/scripts/map-engine.ts`), named "{title}, {time}", in reading order for Tab. Places close together on screen become a number circle; pressing it zooms in. The first press on a pin shows a flag with the title; the second scrolls to its card in the list and moves focus there (owner, 2026-11-10); Escape closes the flag. While the map is on, cards with an exact address show "Get directions" (a plain link with only the address) with the note that the maps app will see it, and cards at an area's center say "Approximate area". The full map credits are in the site footer on pages with a map; the map keeps a short "© OpenStreetMap" in its corner.
- **Street map as small files.** The build writes every tile of the street map pieces as its own file, `dist/map/tiles/<z>/<x>/<y>.mvt` (gzip bytes; about 7,650 files and 88 MB for Greater Philadelphia to zoom 14, the largest under 300 KB), so the map needs no HTTP range requests: Workers static assets answer a range request with the whole file. The browser asks only for tiles inside the region and unpacks them itself. The pieces are also copied whole, only as downloads for the ODbL notice on `/map-data`.
- **Nothing tracked.** All pins are in the page. The map code, worker, stylesheet, letters, road signs and street map load only from this site; nothing goes in the address or browser storage; "Near me" asks for the location only when tapped and centers at neighborhood level. MapLibre (and its 1 MB of code) loads only when someone first chooses Map.
- **Files.** `public/map/fonts` (Noto Sans, OFL-1.1, fonts only: owner Q122) and `public/map/sprites` (MIT) come from one pinned commit: `node scripts/fetch-map-assets.mjs` (checks SHA-256 against `scripts/map-assets.lock.json`; `--check` re-checks). The street map is cut once from one dated Protomaps build with `node scripts/cut-basemap.mjs --build YYYYMMDD --bbox=w,s,e,n --maxzoom 14 --out <folder outside this repo>`: it plans pieces of at most 25 MiB with dry runs and downloads only with `--download`. Needs `brew install pmtiles`.
- **Credit and notice.** "Map: Protomaps © OpenStreetMap contributors" under every map, linked; `/<lang>/map-data/` names the build, the date, the commands and links each piece (ODbL).

### Light by default, with a Dark mode switch

The site is light for everyone, whatever the device is set to (owner, 2026-11-10). The "Dark mode" button in the footer sets `data-theme="dark"` on `<html>`; the dark colours in `styles/tokens.css` apply only then. The choice is kept in this browser only (`localStorage`, `cvh.theme`): no cookie, nothing in the address, nothing sent. A tiny script in the page head applies it before the first paint, so the page does not flash. The map redraws its street map in the matching colours when the switch is pressed. Pages that use no storage (the Medicaid calculator) show no switch and stay light. `<meta name="color-scheme" content="light dark">` tells browsers we have our own dark colours, so Chrome on Android does not darken the page itself.

### About page

`/en/about/` and `/es/about/` (decision 0025): nine sections, each with one of pv-design's drawings (`src/components/ui/aboutArt.ts`), linked from the header and footer. The listing, organization and neighborhood counts come from this build's data (`src/lib/about.ts`). If `aboutArt.ts` lacks a drawing, the build stops; if the file is missing, only test builds (`PV_TEST_BUILD=1`) draw placeholders. It prints as a handout, one section never split across pages.

### Share panel

Every card (dated, flexible, team) and the listing page has a share icon (decision 0027). It opens one panel per page (`components/SharePanel.astro`, a native dialog): Text message, WhatsApp, Facebook, X, Bluesky, Email, Copy link and Instagram. Each is a plain address built in the browser (`src/lib/share.ts`); no outside script, SDK or image loads, and nothing is sent to us. A flexible card shares the organization's page, which is where the card links. Email subjects never hold the listing's title (PROJECT.md 8.1). Instagram draws a 1080 × 1920 picture of the card on the device (`scripts/share-picture.ts`) and opens the device's share sheet, or saves the picture where that is not possible.

### Link previews

When someone shares a link on Facebook or a similar site, the post shows a picture, a title and a short description (decision 0014). Every page carries these tags (`og:*` and `twitter:card`) in its own language. The home page uses the site's name and `og.description`. A listing page uses exactly the home page's preview; only `og:url` points at the listing. No listing's title, date, organization or picture ever goes into a preview (owner, Q38). The pictures are `public/og/en.png` and `public/og/es.png`, 1200 × 630 px.

**Set `PV_SITE_URL` for previews to show a picture.** Facebook needs a full web address for the picture and the page. Without `PV_SITE_URL`, the build leaves out `og:image` and `og:url`, and a shared link shows text only.

## Checks

```sh
npm test               # logic (time of day, filters, campaign switch, open spots, calendar file) and built pages (link previews, robots.txt, place line)
npm run check          # TypeScript and Astro type check
npm run check:licences # every npm package has an allowed licence (MIT, Apache-2.0, BSD, ISC, PSF-2.0, Python-2.0, BlueOak-1.0.0, CC0-1.0)
npm run check:strings  # after a build: any interface text missing from src/i18n/
```

## How it is put together

| Folder | What is in it | Who looks after it |
|---|---|---|
| `src/pages/` | Root page (sends people to their language), home page, listing pages, 404, robots.txt | calendar site |
| `src/layouts/`, `src/components/*.astro` | Page frame, header, language switch, filter panel | calendar site |
| `src/lib/` | Reading the inputs, time zones, filters, the calendar file, listing words | calendar site |
| `src/scripts/` | Browser code: filters, heart, share, add to calendar | calendar site |
| `src/components/ui/`, `src/styles/` | Look and feel: cards, buttons, pills, drawings, colours | design |
| `src/i18n/` | Every word, in English and Spanish | languages |

Rules the code follows:

- **Every word comes from `src/i18n/`.** Organization names and titles are shown as the organization wrote them, marked with their language.
- **Filters run in the browser.** There is no form to submit, so filter choices never reach a server. They are kept for the open tab only.
- **Saved shifts (the heart) stay on the device** (`localStorage`). Nothing is sent anywhere.
- **"Add to my calendar" is made in the browser** from text already in the page, so no request records who saved which shift.
- **Report a problem** opens the visitor's email app, addressed to `site.contact_email`. The subject names the listing's id, never its title.
- **Campaign listings exist only when `features.campaigns` is true.** With it false, no campaign listing, filter choice or label is in the build.
- **Areas appear in the area filter only when the settings mark them `live`**, and only when there are two or more.
- **Where a shift is (decision 0013).** A card shows the section and neighborhood, such as "River Wards · Kensington"; only one known shows that one; neither shows the area name. Section names come from `sections` in the settings, like area names; with no `sections`, none are shown. The listing page lists address, neighborhood, section and area, skipping empty or repeated ones.
- **Open spots** show only when the organization's page gave them: "Full", or "6 spots left as of last night". Nothing is estimated.
- **No outside scripts, fonts or images.**

## Two packages replaced by empty stand-ins

We use Astro 7 because it has the security fixes. Astro 7 brings two packages whose licences this project does not allow, so each is replaced by an empty stand-in in `vendor/`, through `overrides` in `package.json`:

| Package | Licence | Why we can do without it |
|---|---|---|
| `sharp` (image library) | LGPL | The site processes no images; `astro.config.mjs` uses the pass-through image service. |
| `lightningcss` (CSS tool inside Vite) | MPL-2.0 | `astro.config.mjs` tells Vite to handle CSS with PostCSS and not to minify it. The CSS ships unminified (about 16 KB before compression). |

If anything ever calls a stand-in, the build stops with an error naming the setting to keep (for lightningcss: `lightningcss.bundleAsync was called, but lightningcss is not installed ... Keep vite.css.transformer 'postcss' ...`). `npm test` checks that the stand-ins are installed and that the settings are in place.
